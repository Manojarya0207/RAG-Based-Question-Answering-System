import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { 
  Upload, FileText, Send, Loader2, Trash2, CheckCircle2, 
  AlertCircle, ChevronRight, Search, BookOpen, ExternalLink,
  Sparkles, History, MessageSquare, X, Info, Eye
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Utility for Tailwind classes */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- Types ---
interface DocumentMetadata {
  id: string
  filename: string
  status: 'pending' | 'processing' | 'ready' | 'failed'
  created_at: number
  summary?: string
}

interface Source {
  chunk_index: number
  score: number
  text: string
  filename: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  timestamp: number
}

// --- API Client ---
const api = axios.create({
  baseURL: '/api'
})

export default function App() {
  const [documents, setDocuments] = useState<DocumentMetadata[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isQuerying, setIsQuerying] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [viewingDocId, setViewingDocId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  // Initial load
  useEffect(() => {
    fetchDocuments()
    fetchHistory()
    const timer = setInterval(fetchDocuments, 5000)
    return () => clearInterval(timer)
  }, [])

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [messages, isQuerying])

  const fetchDocuments = async () => {
    try {
      const res = await api.get<DocumentMetadata[]>('/documents')
      setDocuments(res.data)
    } catch (err) {
      console.error("Failed to fetch documents", err)
    }
  }

  const fetchHistory = async () => {
    try {
      const res = await api.get<any[]>('/history')
      const formattedHistory: Message[] = res.data.map((m, i) => ({
        id: `hist-${i}-${m.timestamp}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp * 1000
      }))
      setMessages(formattedHistory)
    } catch (err) {
      console.error("Failed to fetch history", err)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)

    try {
      await api.post('/upload', formData)
      fetchDocuments()
    } catch (err: any) {
      setError(err.response?.data?.detail || "Upload failed")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/documents/${id}`)
      setDocuments(prev => prev.filter(d => d.id !== id))
      if (selectedDocId === id) setSelectedDocId(null)
      if (viewingDocId === id) setViewingDocId(null)
    } catch (err) {
      console.error("Delete failed", err)
    }
  }

  const handleClearHistory = async () => {
    setIsClearing(true)
    try {
      await api.post('/history/clear')
      setMessages([])
    } catch (err) {
      console.error("Failed to clear history", err)
    } finally {
      setIsClearing(false)
    }
  }

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isQuerying) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsQuerying(true)
    setError(null)

    try {
      const res = await api.post('/query', {
        question: userMessage.content,
        document_id: selectedDocId,
        top_k: 5
      })

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.data.answer,
        sources: res.data.sources,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, aiMessage])
    } catch (err: any) {
      setError(err.response?.data?.detail || "Query failed")
    } finally {
      setIsQuerying(false)
    }
  }

  const handleSuggestion = (prompt: string) => {
    setInput(prompt)
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  const suggestions = [
    { title: "Summarize PDF", icon: <FileText className="w-4 h-4" />, prompt: "Can you provide a concise summary of the selected document?" },
    { title: "Key Takeaways", icon: <Info className="w-4 h-4" />, prompt: "What are the top 3 most important points in this information?" },
    { title: "Explain Simply", icon: <Sparkles className="w-4 h-4" />, prompt: "Explain the main concepts here as if I am a beginner." },
    { title: "Check Citations", icon: <BookOpen className="w-4 h-4" />, prompt: "What are the specific sources for the claims made in this document?" }
  ]

  const selectedDoc = documents.find(d => d.id === selectedDocId)
  const viewingDoc = documents.find(d => d.id === viewingDocId)

  return (
    <div className="flex h-screen bg-[#050505] text-slate-200 p-4 lg:p-6 gap-6 font-sans selection:bg-primary/30 relative overflow-hidden">
      
      {/* PDF Viewer Overlay */}
      <AnimatePresence>
        {viewingDoc && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-6 z-50 glass-card rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl border-white/10"
          >
            <div className="px-8 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary" />
                <h2 className="font-bold text-lg text-white">{viewingDoc.filename}</h2>
              </div>
              <button 
                onClick={() => setViewingDocId(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-all text-slate-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 bg-zinc-900/50">
              <iframe 
                src={`/api/documents/${viewingDoc.id}/file`} 
                className="w-full h-full border-none"
                title="PDF Viewer"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar: Library */}
      <aside className="w-80 flex flex-col gap-5">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2.5 bg-primary/20 rounded-2xl border border-primary/30 shadow-lg shadow-primary/5">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight leading-none text-white">Antigravity</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold mt-1">Intelligence Layer</p>
          </div>
        </div>

        <div className="glass-card rounded-[2rem] flex-1 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-white/[0.05] flex justify-between items-center bg-white/[0.01]">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <h2 className="font-bold text-xs uppercase tracking-widest text-slate-400">Library</h2>
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-2 hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-white/10 active:scale-95 disabled:opacity-50"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Upload className="w-4 h-4 text-slate-300" />}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".pdf,.txt" 
              onChange={handleFileUpload}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <AnimatePresence initial={false}>
              {documents.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center text-center opacity-30 py-10"
                >
                  <FileText className="w-10 h-10 mb-3 text-slate-400" />
                  <p className="text-sm font-medium">Empty Library</p>
                  <p className="text-[10px] mt-1">Upload files to begin analysis</p>
                </motion.div>
              ) : (
                documents.map((doc) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={doc.id}
                    onClick={() => setSelectedDocId(selectedDocId === doc.id ? null : doc.id)}
                    className={cn(
                      "group relative p-4 rounded-2xl transition-all cursor-pointer border",
                      selectedDocId === doc.id 
                        ? "bg-primary/10 border-primary/30 shadow-sm" 
                        : "hover:bg-white/[0.03] border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        {doc.status === 'ready' ? (
                          <div className="p-2 bg-emerald-500/10 rounded-xl">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          </div>
                        ) : doc.status === 'failed' ? (
                          <div className="p-2 bg-rose-500/10 rounded-xl">
                            <AlertCircle className="w-4 h-4 text-rose-400" />
                          </div>
                        ) : (
                          <div className="p-2 bg-primary/10 rounded-xl">
                            <Loader2 className="w-4 h-4 text-primary animate-spin" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate text-slate-200">{doc.filename}</p>
                        <p className={cn(
                          "text-[10px] font-medium uppercase tracking-tighter opacity-60 mt-0.5",
                          doc.status === 'ready' && "text-emerald-400"
                        )}>
                          {doc.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setViewingDocId(doc.id); }}
                          className="opacity-0 group-hover:opacity-60 hover:opacity-100 p-1.5 hover:text-primary transition-all active:scale-90"
                          title="Open Viewer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                          className="opacity-0 group-hover:opacity-60 hover:opacity-100 p-1.5 hover:text-rose-400 transition-all active:scale-90"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
          
          <div className="p-4 bg-white/[0.01] border-t border-white/[0.05]">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>{documents.length} Files</span>
              <button 
                onClick={handleClearHistory}
                disabled={isClearing || messages.length === 0}
                className="flex items-center gap-1.5 hover:text-rose-400 transition-colors disabled:opacity-30"
              >
                <History className="w-3 h-3" />
                Clear Chat
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Interface */}
      <main className="flex-1 flex flex-col gap-5 min-w-0 z-0">
        
        {/* Top Feature Bar: Document Summary */}
        <AnimatePresence mode="wait">
          {selectedDoc && (
            <motion.div 
              initial={{ height: 0, opacity: 0, marginBottom: -20 }}
              animate={{ height: 'auto', opacity: 1, marginBottom: 0 }}
              exit={{ height: 0, opacity: 0, marginBottom: -20 }}
              className="overflow-hidden"
            >
              <div className="glass-card rounded-[2rem] p-6 relative border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                <div className="flex items-start gap-5">
                  <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                    <Info className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-100 flex items-center gap-2">
                        Document Intelligence
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded-full border border-emerald-500/20">SUMMARY READY</span>
                      </h3>
                      <button onClick={() => setSelectedDocId(null)} className="p-1 hover:bg-white/5 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-slate-500" />
                      </button>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed max-w-4xl italic">
                      " {selectedDoc.summary || "Summary is being generated for this document. It will appear here once ready."} "
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="glass-card rounded-[2.5rem] flex-1 flex flex-col overflow-hidden relative">
          
          {/* Chat Header */}
          <div className="px-8 py-5 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.01]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white tracking-wide">Contextual Assistant</h2>
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold uppercase tracking-tighter">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                  {selectedDocId ? "Filtered Context Active" : "Global Knowledge Base"}
                </div>
              </div>
            </div>
          </div>

          {/* Chat Messages */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-8 py-8 space-y-10"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center mt-[-2rem]">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="w-20 h-20 bg-primary/10 rounded-[2.5rem] flex items-center justify-center mb-8 border border-primary/20 shadow-2xl shadow-primary/20"
                >
                  <Sparkles className="w-10 h-10 text-primary" />
                </motion.div>
                <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">How can I help you today?</h3>
                <p className="max-w-md text-sm text-slate-500 leading-relaxed px-6 mb-10">
                  Ask me anything about your library, or start a general conversation. I'm here to analyze your data with ChatGPT-level intelligence.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full px-4">
                  {suggestions.map((s, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      onClick={() => handleSuggestion(s.prompt)}
                      className="flex items-center gap-3 p-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl hover:bg-white/[0.06] hover:border-primary/40 transition-all text-left group"
                    >
                      <div className="p-2 bg-white/[0.05] rounded-xl group-hover:text-primary transition-colors">
                        {s.icon}
                      </div>
                      <span className="text-xs font-semibold text-slate-300 group-hover:text-white">{s.title}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id || idx}
                  className={cn(
                    "flex flex-col gap-4",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}
                >
                  <div className={cn(
                    "max-w-[85%] px-6 py-4 rounded-[1.8rem] text-sm leading-relaxed shadow-2xl overflow-hidden",
                    msg.role === 'user' 
                      ? "bg-primary text-white border border-primary-dark/30 rounded-tr-none" 
                      : "bg-[#111] border border-white/[0.08] text-slate-100 rounded-tl-none font-medium prose prose-invert prose-sm max-w-none"
                  )}>
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '')
                            return !inline && match ? (
                              <SyntaxHighlighter
                                children={String(children).replace(/\n$/, '')}
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                className="rounded-xl !bg-[#0a0a0a] !p-4 border border-white/5 my-4"
                                {...props}
                              />
                            ) : (
                              <code className={cn("bg-white/10 px-1.5 py-0.5 rounded text-primary-light", className)} {...props}>
                                {children}
                              </code>
                            )
                          },
                          p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="marker:text-primary">{children}</li>,
                          h1: ({ children }) => <h1 className="text-lg font-bold mb-4 text-white">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-base font-bold mb-3 text-white">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-bold mb-2 text-white">{children}</h3>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                  
                  <AnimatePresence>
                    {msg.sources && msg.sources.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="flex flex-wrap gap-2 px-1"
                      >
                        {msg.sources.map((src, i) => (
                          <div 
                            key={i}
                            className="group/tag bg-white/[0.03] border border-white/[0.07] hover:border-primary/50 rounded-full px-3 py-1 text-[10px] font-bold text-slate-500 hover:text-primary transition-all flex items-center gap-2 cursor-help"
                            title={src.text}
                          >
                            <FileText className="w-3 h-3 opacity-60 group-hover/tag:opacity-100" />
                            <span>{src.filename}</span>
                            <span className="opacity-40">CHUNK {src.chunk_index}</span>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))
            )}
            
            {isQuerying && (
              <div className="flex items-center gap-4 px-2">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Processing Knowledge...</span>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-8 bg-white/[0.01] border-t border-white/[0.05]">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="mb-4 px-5 py-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-400 text-xs font-semibold"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}
            <form onSubmit={handleQuery} className="relative max-w-5xl mx-auto group/form">
              <textarea 
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleQuery(e as any)
                  }
                }}
                placeholder={selectedDocId ? `Query ${selectedDoc?.filename}...` : "Ask Antigravity anything..."}
                rows={1}
                className="w-full bg-white/[0.03] border border-white/[0.1] rounded-[1.5rem] py-4 pl-8 pr-20 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 focus:bg-white/[0.05] transition-all text-sm font-medium placeholder:text-slate-600 shadow-inner resize-none min-h-[60px] max-h-[200px]"
                disabled={isQuerying}
              />
              <button 
                type="submit"
                disabled={isQuerying || !input.trim()}
                className="absolute right-3 bottom-3 aspect-square h-10 bg-primary hover:bg-primary-dark text-white rounded-xl transition-all disabled:opacity-20 disabled:hover:bg-primary shadow-lg shadow-primary/20 active:scale-90 flex items-center justify-center group"
              >
                <Send className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
            </form>
            <p className="text-center text-[10px] text-slate-600 mt-4 font-bold uppercase tracking-[0.2em]">
              Powered by Multi-Document Retrieval Augmented Generation
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { 
  Upload, FileText, Send, Loader2, Trash2, CheckCircle2, 
  AlertCircle, ChevronRight, Search, BookOpen, ExternalLink,
  Sparkles, History, MessageSquare, X, Info, Eye, Plus, LayoutGrid, Settings, LogOut, User
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null)
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [notification])

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type })
  }

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
    showNotification(`Uploading ${file.name}...`, 'info')
    
    const formData = new FormData()
    formData.append('file', file)

    try {
      await api.post('/upload', formData)
      showNotification("Upload successful. Processing...", 'success')
      fetchDocuments()
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Upload failed"
      setError(msg)
      showNotification(msg, 'error')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    const doc = documents.find(d => d.id === id)
    try {
      await api.delete(`/documents/${id}`)
      setDocuments(prev => prev.filter(d => d.id !== id))
      if (selectedDocId === id) setSelectedDocId(null)
      if (viewingDocId === id) setViewingDocId(null)
      showNotification(`Deleted ${doc?.filename || 'document'}`, 'success')
    } catch (err) {
      console.error("Delete failed", err)
      showNotification("Failed to delete document", 'error')
    }
  }

  const handleClearHistory = () => {
    setIsClearing(true)
    api.post('/history/clear')
      .then(() => {
        setMessages([])
        showNotification("Chat history cleared", 'success')
      })
      .catch(err => {
        console.error("History clear failed", err)
        showNotification("Failed to clear history", 'error')
      })
      .finally(() => setIsClearing(false))
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
    if (textareaRef.current) textareaRef.current.focus()
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
    <div className="chat-container">
      {/* Notifications Overlay */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={cn(
              "fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border backdrop-blur-xl animate-fade-in",
              notification.type === 'success' && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
              notification.type === 'error' && "bg-rose-500/10 border-rose-500/20 text-rose-400",
              notification.type === 'info' && "bg-primary/10 border-primary/20 text-primary"
            )}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
            {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
            {notification.type === 'info' && <Info className="w-5 h-5" />}
            <span className="text-sm font-semibold">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar: Navigation & Library */}
      <aside className={cn("sidebar", !isSidebarOpen && "w-0 overflow-hidden border-none")}>
        <div className="p-3">
          <button 
            onClick={handleClearHistory}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 transition-colors text-sm font-medium mb-4"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Library Section */}
        <div className="flex-1 overflow-y-auto px-2 space-y-4">
          <div>
            <div className="flex items-center justify-between px-3 mb-2">
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Connected Knowledge</h3>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-1 hover:text-white transition-colors"
                title="Add Document"
              >
                {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.txt" onChange={handleFileUpload} />
            </div>
            
            <div className="space-y-1">
              {documents.length === 0 ? (
                <p className="px-3 py-2 text-[11px] text-white/30 italic">No documents uploaded yet.</p>
              ) : (
                documents.map(doc => (
                  <div 
                    key={doc.id}
                    onClick={() => setSelectedDocId(selectedDocId === doc.id ? null : doc.id)}
                    className={cn(
                      "sidebar-item group",
                      selectedDocId === doc.id && "active"
                    )}
                  >
                    <BookOpen className="w-4 h-4 shrink-0 text-white/40" />
                    <span className="truncate flex-1">{doc.filename}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button 
                        onClick={(e) => { e.stopPropagation(); setViewingDocId(doc.id); }}
                        className="p-1 hover:text-primary"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                        className="p-1 hover:text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* User Profile */}
        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <User className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Manoj Sarya</p>
              <p className="text-[10px] text-white/40">Premium Account</p>
            </div>
            <Settings className="w-4 h-4 text-white/40 group-hover:text-white" />
          </div>
        </div>
      </aside>

      {/* Main Chat Interface */}
      <main className="main-content">
        {/* Mobile Header / Sidebar Toggle */}
        <header className="h-14 border-b border-white/5 flex items-center px-4 justify-between bg-bg-main">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-md text-white/60"
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm tracking-tight">Antigravity</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-white/40 font-mono">3.5</span>
            </div>
          </div>
        </header>

        {/* Message Thread */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-8 border border-white/10"
              >
                <Sparkles className="w-8 h-8 text-white" />
              </motion.div>
              <h2 className="text-2xl font-bold mb-8">How can I help you today?</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestion(s.prompt)}
                    className="p-4 text-left rounded-xl border border-white/10 hover:bg-white/5 transition-all group"
                  >
                    <p className="text-sm font-semibold mb-1 group-hover:text-primary transition-colors">{s.title}</p>
                    <p className="text-xs text-white/40 truncate">{s.prompt}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-6">
              {messages.map((msg, idx) => (
                <div 
                  key={msg.id || idx}
                  className={cn(
                    "message-bubble animate-slide-in",
                    msg.role === 'assistant' ? "assistant" : "user"
                  )}
                >
                  <div className="message-avatar">
                    {msg.role === 'assistant' ? 'A' : <User className="w-4 h-4" />}
                  </div>
                  <div className="message-text">
                    <p className={cn("text-[11px] font-bold uppercase tracking-widest mb-2 opacity-40")}>
                      {msg.role === 'assistant' ? 'Antigravity' : 'You'}
                    </p>
                    <div className="prose prose-invert prose-sm max-w-none">
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
                                className="rounded-xl !bg-[#0f0f0f] !p-4 border border-white/5 my-4"
                                {...props}
                              />
                            ) : (
                              <code className={cn("bg-white/10 px-1.5 py-0.5 rounded text-primary", className)} {...props}>
                                {children}
                              </code>
                            )
                          }
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-6 flex flex-wrap gap-2">
                        {msg.sources.map((src, i) => (
                          <div 
                            key={i}
                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] flex items-center gap-2 hover:bg-white/10 transition-colors cursor-help"
                            title={src.text}
                          >
                            <FileText className="w-3 h-3 text-white/40" />
                            <span className="font-medium">{src.filename}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isQuerying && (
                <div className="message-bubble assistant">
                  <div className="message-avatar animate-pulse">A</div>
                  <div className="message-text">
                    <div className="flex gap-1 mt-2">
                      <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Region */}
        <div className="p-4 md:p-0">
          <div className="input-container">
            {error && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-xs font-semibold max-w-2xl mx-auto">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            
            <form onSubmit={handleQuery} className="prompt-bar group">
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
                placeholder={selectedDocId ? `Ask about ${selectedDoc?.filename}...` : "Message Antigravity..."}
                rows={1}
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-1 max-h-[200px] resize-none placeholder:text-white/20"
                disabled={isQuerying}
              />
              <button 
                type="submit"
                disabled={isQuerying || !input.trim()}
                className="p-1.5 bg-white text-black rounded-lg disabled:bg-white/10 disabled:text-white/20 transition-all hover:scale-105 active:scale-95"
              >
                <ChevronRight className="w-5 h-5 -rotate-90 stroke-[3]" />
              </button>
            </form>
            
            {selectedDoc && (
              <div className="mt-3 flex justify-center">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-[10px] font-bold text-primary uppercase tracking-tighter">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                  Context: {selectedDoc.filename}
                  <button onClick={() => setSelectedDocId(null)} className="ml-1 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            <p className="text-center text-[10px] text-white/10 mt-4 font-bold uppercase tracking-[0.1em]">
              Antigravity can make mistakes. Check important info.
            </p>
          </div>
        </div>
      </main>

      {/* PDF Viewer Overlay */}
      <AnimatePresence>
        {viewingDoc && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-12"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="w-full h-full glass-card rounded-2xl flex flex-col overflow-hidden max-w-6xl shadow-2xl"
            >
              <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-primary" />
                  <h2 className="font-bold text-lg text-white">{viewingDoc.filename}</h2>
                </div>
                <button 
                  onClick={() => setViewingDocId(null)}
                  className="p-2 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-white"
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

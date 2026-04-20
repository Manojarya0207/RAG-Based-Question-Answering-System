import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { 
  Upload, FileText, Send, Loader2, Trash2, CheckCircle2, 
  AlertCircle, ChevronRight, Search, BookOpen, ExternalLink
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch documents on mount
  useEffect(() => {
    fetchDocuments()
    const timer = setInterval(fetchDocuments, 5000) // Poll for status updates
    return () => clearInterval(timer)
  }, [])

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
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
    } catch (err) {
      console.error("Delete failed", err)
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

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-foreground p-4 lg:p-6 gap-6 font-sans">
      
      {/* Sidebar: Document Management */}
      <aside className="w-80 flex flex-col gap-4">
        <div className="flex items-center gap-3 px-2 mb-2">
          <div className="p-2 bg-primary/10 rounded-xl">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Antigravity RAG</h1>
            <p className="text-xs text-zinc-500">Document Intelligence</p>
          </div>
        </div>

        <div className="glass-card rounded-2xl flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <h2 className="font-semibold text-sm uppercase tracking-wider text-zinc-400">Library</h2>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              title="Upload Document"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".pdf,.txt" 
              onChange={handleFileUpload}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {documents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-10">
                <FileText className="w-8 h-8 mb-2" />
                <p className="text-sm">No documents yet</p>
                <p className="text-[10px]">Upload a PDF or TXT to start</p>
              </div>
            ) : (
              documents.map((doc) => (
                <div 
                  key={doc.id}
                  onClick={() => setSelectedDocId(selectedDocId === doc.id ? null : doc.id)}
                  className={cn(
                    "group relative p-3 rounded-xl transition-all cursor-pointer border border-transparent",
                    selectedDocId === doc.id ? "bg-primary/10 border-primary/20" : "hover:bg-white/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {doc.status === 'ready' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : doc.status === 'failed' ? (
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate pr-6">{doc.filename}</p>
                      <p className="text-[10px] text-zinc-500 capitalize">{doc.status}</p>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                      className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="p-3 bg-white/[0.02] border-t border-white/5">
            <p className="text-[10px] text-center text-zinc-600">
              {selectedDocId 
                ? "Filtering queries to " + documents.find(d => d.id === selectedDocId)?.filename 
                : "Searching all documents"}
            </p>
          </div>
        </div>
      </aside>

      {/* Main: Chat Interface */}
      <main className="flex-1 flex flex-col gap-4">
        <div className="glass-card rounded-2xl flex-1 flex flex-col overflow-hidden relative">
          
          {/* Chat Messages */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                <Search className="w-12 h-12 mb-4" />
                <h3 className="text-xl font-medium">Ask anything</h3>
                <p className="max-w-xs text-sm mt-2">
                  Query your documents using natural language. I'll provide answers backed by specific chunks.
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id}
                  className={cn(
                    "flex flex-col gap-3",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}
                >
                  <div className={cn(
                    "max-w-[85%] px-5 py-3 rounded-2xl text-sm leading-relaxed",
                    msg.role === 'user' 
                      ? "bg-primary text-white shadow-lg shadow-primary/20" 
                      : "bg-zinc-900 border border-white/5 text-zinc-100"
                  )}>
                    {msg.content}
                  </div>
                  
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-tighter w-full mb-1">Sources</p>
                      {msg.sources.map((src, i) => (
                        <div 
                          key={i}
                          className="bg-zinc-900/50 border border-white/5 rounded-lg px-2 py-1 text-[10px] flex items-center gap-1.5 max-w-[200px]"
                          title={src.text}
                        >
                          <FileText className="w-3 h-3 text-primary/70" />
                          <span className="truncate">{src.filename} (p.{Math.floor(src.chunk_index/2)+1})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))
            )}
            
            {isQuerying && (
              <div className="flex items-center gap-3 text-sm text-zinc-500 animate-pulse">
                <div className="w-2 h-2 bg-primary rounded-full" />
                <span>Thinking...</span>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white/[0.02] border-t border-white/5">
            {error && (
              <div className="mb-3 px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-500 text-xs">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            <form onSubmit={handleQuery} className="relative">
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about your documents..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-5 pr-14 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm placeholder:text-zinc-600"
                disabled={isQuerying}
              />
              <button 
                type="submit"
                disabled={isQuerying || !input.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-primary hover:bg-primary-dark text-white rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-primary"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}

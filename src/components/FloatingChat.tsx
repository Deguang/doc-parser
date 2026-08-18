import { useState, useRef, useEffect } from 'react';
import { initLLM, buildLocalVectorDB, chatWithDocument, DEFAULT_MODEL } from '../utils/llmManager';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function FloatingChat({ markdownContent }: { markdownContent: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isIndexed, setIsIndexed] = useState(false);
  const [progressText, setProgressText] = useState('');
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleOpen = async () => {
    setIsOpen(true);
    if (!isIndexed && markdownContent) {
      setIsInitializing(true);
      try {
        // Step 1: Initialize Local Vector DB
        await buildLocalVectorDB(markdownContent, setProgressText);
        
        // Step 2: Initialize WebLLM
        setProgressText('Initializing Local LLM Worker...');
        await initLLM((report) => {
          setProgressText(`Loading ${DEFAULT_MODEL}: ${Math.round(report.progress * 100)}%`);
        });
        
        setIsIndexed(true);
        setMessages([{ role: 'assistant', content: 'Local knowledge base initialized! Ask me anything about this document.' }]);
      } catch (err: any) {
        setMessages([{ role: 'system', content: `Initialization failed: ${err.message}` }]);
      } finally {
        setIsInitializing(false);
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isReplying || !isIndexed) return;
    
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }, { role: 'assistant', content: '' }]);
    setIsReplying(true);
    
    try {
      await chatWithDocument(userMsg, (partialText) => {
        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1] = { role: 'assistant', content: partialText };
          return newMsgs;
        });
      });
    } catch (err: any) {
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1] = { role: 'system', content: `Error: ${err.message}` };
        return newMsgs;
      });
    } finally {
      setIsReplying(false);
    }
  };

  if (!markdownContent) return null;

  if (!isOpen) {
    return (
      <button 
        onClick={handleOpen}
        className="fixed bottom-6 right-6 p-4 rounded-full bg-primary text-on-primary shadow-lg hover:shadow-xl transition-all duration-300 z-50 hover:scale-105 active:scale-95 flex items-center justify-center gap-2 font-label-caps"
      >
        <span className="material-symbols-outlined">smart_toy</span>
        Chat with PDF
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[400px] h-[600px] max-h-[80vh] glass-panel border border-white/20 rounded-2xl flex flex-col shadow-2xl z-50 overflow-hidden transform transition-all duration-300">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">smart_toy</span>
          <span className="font-label-caps font-bold">Local RAG Chat</span>
          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-mono">100% Private</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-on-surface-variant hover:text-white transition-colors">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3" ref={scrollRef}>
        {isInitializing ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl animate-spin text-primary">memory</span>
            <p className="font-mono text-sm max-w-[250px] break-words">{progressText}</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-primary text-on-primary rounded-tr-sm' 
                  : msg.role === 'system'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-white/10 text-on-surface rounded-tl-sm border border-white/10'
              }`}>
                {msg.content}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 bg-white/5">
        <div className="relative flex items-center">
          <input 
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            disabled={isInitializing || isReplying || !isIndexed}
            placeholder={isInitializing ? "Loading models..." : "Ask something..."}
            className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder-on-surface-variant focus:outline-none focus:border-primary/50 transition-colors"
          />
          <button 
            onClick={handleSend}
            disabled={isInitializing || isReplying || !input.trim()}
            className="absolute right-2 p-1.5 rounded-lg text-primary hover:bg-primary/20 disabled:opacity-50 disabled:hover:bg-transparent transition-colors flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-xl">send</span>
          </button>
        </div>
      </div>
    </div>
  );
}

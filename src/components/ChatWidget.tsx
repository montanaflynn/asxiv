import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './ChatWidget.module.css';
import { Message, StructuredChatResponse, ChatApiResponse, SuggestedQuestion } from '../types/chat';
import { processPageReferences, handlePageNavigation } from '../utils/pageLinks';

// Component to render markdown with clickable page references
const MarkdownWithPageLinks: React.FC<{ content: string }> = ({ content }) => {
  const handlePageClick = (pageNum: string) => {
    console.log('Page link clicked:', pageNum);
    handlePageNavigation(pageNum);
  };

  // Convert (page N) and (page N, page M) formats to clickable links
  const processedContent = processPageReferences(content);
  
  return (
    <ReactMarkdown 
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children, node, ...props }) => {
          // Check if this is a page reference link
          const pageMatch = href?.match(/^#page-(\d+)$/);
          if (pageMatch) {
            const pageNum = pageMatch[1];
            return (
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handlePageClick(pageNum);
                }}
                className={styles.pageLink}
                {...props}
              >
                {children}
              </a>
            );
          }
          return <a href={href} {...props}>{children}</a>;
        }
      }}
    >
      {processedContent}
    </ReactMarkdown>
  );
};


// Component to render suggested questions
const SuggestedQuestions: React.FC<{ 
  questions: SuggestedQuestion[]; 
  onQuestionClick: (question: string) => void;
}> = ({ questions, onQuestionClick }) => {
  if (!questions || questions.length === 0) return null;

  return (
    <div className={styles.suggestedQuestions}>
      <h4 className={styles.suggestedTitle}>Suggested questions:</h4>
      <div className={styles.questionsList}>
        {questions.map((question, index) => (
          <button
            key={index}
            className={styles.questionButton}
            onClick={() => onQuestionClick(question.text)}
            title={question.description}
          >
            {question.text}
          </button>
        ))}
      </div>
    </div>
  );
};

interface ChatWidgetProps {
  arxivId?: string;
}

const ChatWidget: React.FC<ChatWidgetProps> = ({ arxivId }) => {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get arxivId from router if not provided as prop
  const currentArxivId = arxivId || (router.query.arxivId as string);

  const scrollToUserMessage = () => {
    // Find the last user message and scroll to it instead of the bottom
    const chatContainer = document.querySelector(`.${styles.messages}`);
    if (chatContainer) {
      const messageElements = chatContainer.querySelectorAll(`.${styles.message}`);
      if (messageElements.length >= 2) {
        // Scroll to the second-to-last message (which should be the user's question)
        const userMessage = messageElements[messageElements.length - 2] as HTMLElement;
        const containerRect = chatContainer.getBoundingClientRect();
        const messageRect = userMessage.getBoundingClientRect();
        const scrollTop = chatContainer.scrollTop + (messageRect.top - containerRect.top) - 20; // 20px top padding
        
        chatContainer.scrollTo({
          top: scrollTop,
          behavior: 'smooth'
        });
      } else {
        // Fallback to bottom if we don't have enough messages
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  const handleSuggestedQuestionClick = async (question: string) => {
    if (isLoading || !currentArxivId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: question,
      isBot: false,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      // Prepare messages for API (exclude timestamps and IDs)
      const apiMessages = messages
        .filter(msg => !msg.isBot || msg.id !== 'welcome') // Exclude welcome message
        .concat(userMessage)
        .map(msg => ({
          role: msg.isBot ? 'assistant' : 'user' as const,
          content: msg.text
        }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: apiMessages,
          arxivId: currentArxivId
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // Extract detailed error information
        let errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
        
        // Try to parse JSON error structures (e.g., from Gemini API)
        if (typeof errorMessage === 'string' && errorMessage.includes('{')) {
          try {
            // Extract everything after the first hyphen and space, then parse JSON
            const parts = errorMessage.split(' - ');
            if (parts.length > 1) {
              const jsonPart = parts.slice(1).join(' - '); // In case there are multiple hyphens
              const jsonError = JSON.parse(jsonPart);
              if (jsonError.error && jsonError.error.message) {
                errorMessage = `${parts[0]} - ${jsonError.error.message}`;
              }
            }
          } catch {
            // If JSON parsing fails, keep the original message
          }
        }
        
        // If there are additional error details, include them
        if (errorData.details && !errorMessage.includes(errorData.details)) {
          errorMessage += ` - ${errorData.details}`;
        }
        
        throw new Error(errorMessage);
      }

      // Handle JSON response from Gemini
      const data: ChatApiResponse = await response.json();
      if (!data.response && !data.structured) {
        throw new Error('No response from AI');
      }

      // Use structured response if available, fallback to plain text
      const messageText = data.structured?.content || data.response || '';
      const structuredData = data.structured;

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: messageText,
        isBot: true,
        timestamp: new Date(),
        structured: structuredData
      };

      setMessages(prev => [...prev, botMessage]);

    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Request was cancelled, don't show error
      }
      
      console.error('Chat error:', error);
      
      // Add error message as a bot message in the chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: error instanceof Error ? error.message : 'Failed to get response. Please try again.',
        isBot: true,
        timestamp: new Date(),
        isError: true
      };
      
      setMessages(prev => [...prev, errorMessage]);
      setError(null); // Clear any existing error state
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    // Only scroll when we have both user message and bot response
    if (messages.length >= 2) {
      // Add a small delay to ensure the message is rendered
      setTimeout(scrollToUserMessage, 100);
    }
  }, [messages]);

  const handleWelcomeMessage = useCallback(async (welcomePrompt: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: welcomePrompt
          }],
          arxivId: currentArxivId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate welcome message');
      }

      const data: ChatApiResponse = await response.json();
      
      // Use structured response if available, fallback to plain text
      const messageText = data.structured?.content || data.response || '';
      const structuredData = data.structured;
      
      setMessages([{
        id: 'welcome',
        text: messageText,
        isBot: true,
        timestamp: new Date(),
        structured: structuredData
      }]);
    } catch (error: unknown) {
      console.error('Welcome message error:', error);
      // Fallback to simple welcome message
      setMessages([{
        id: 'welcome',
        text: `Welcome! I'm here to help you understand arXiv paper ${currentArxivId}. Ask me anything about the paper!`,
        isBot: true,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [currentArxivId]);

  // Initialize with AI-generated welcome message when arxivId changes
  useEffect(() => {
    if (currentArxivId && messages.length === 0) {
      // Send an automatic welcome request to the AI
      const welcomeMessage = 'Please provide a welcome message for this paper with suggested questions I can ask about it.';
      handleWelcomeMessage(welcomeMessage);
    }
  }, [currentArxivId, messages.length, handleWelcomeMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      
      if (!message.trim() || isLoading || !currentArxivId) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        text: message.trim(),
        isBot: false,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, userMessage]);
      setMessage('');
      setIsLoading(true);
      setError(null);

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      // Prepare messages for API (exclude timestamps and IDs)
      const apiMessages = messages
        .filter(msg => !msg.isBot || msg.id !== 'welcome') // Exclude welcome message
        .concat(userMessage)
        .map(msg => ({
          role: msg.isBot ? 'assistant' : 'user' as const,
          content: msg.text
        }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: apiMessages,
          arxivId: currentArxivId
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // Extract detailed error information
        let errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
        
        // Try to parse JSON error structures (e.g., from Gemini API)
        if (typeof errorMessage === 'string' && errorMessage.includes('{')) {
          try {
            // Extract everything after the first hyphen and space, then parse JSON
            const parts = errorMessage.split(' - ');
            if (parts.length > 1) {
              const jsonPart = parts.slice(1).join(' - '); // In case there are multiple hyphens
              const jsonError = JSON.parse(jsonPart);
              if (jsonError.error && jsonError.error.message) {
                errorMessage = `${parts[0]} - ${jsonError.error.message}`;
              }
            }
          } catch {
            // If JSON parsing fails, keep the original message
          }
        }
        
        // If there are additional error details, include them
        if (errorData.details && !errorMessage.includes(errorData.details)) {
          errorMessage += ` - ${errorData.details}`;
        }
        
        throw new Error(errorMessage);
      }

      // Handle JSON response from Gemini
      const data: ChatApiResponse = await response.json();
      if (!data.response && !data.structured) {
        throw new Error('No response from AI');
      }

      // Use structured response if available, fallback to plain text
      const messageText = data.structured?.content || data.response || '';
      const structuredData = data.structured;

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: messageText,
        isBot: true,
        timestamp: new Date(),
        structured: structuredData
      };

      setMessages(prev => [...prev, botMessage]);

    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Request was cancelled, don't show error
      }
      
      console.error('Chat error:', error);
      
      // Add error message as a bot message in the chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: error instanceof Error ? error.message : 'Failed to get response. Please try again.',
        isBot: true,
        timestamp: new Date(),
        isError: true
      };
      
      setMessages(prev => [...prev, errorMessage]);
      setError(null); // Clear any existing error state
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
    } catch (unexpectedError: unknown) {
      // Handle any unexpected runtime errors
      console.error('Unexpected error in handleSubmit:', unexpectedError);
      
      const errorMessage: Message = {
        id: Date.now().toString(),
        text: unexpectedError instanceof Error ? unexpectedError.message : 'An unexpected error occurred. Please try refreshing the page.',
        isBot: true,
        timestamp: new Date(),
        isError: true
      };
      
      setMessages(prev => [...prev, errorMessage]);
      setIsLoading(false);
      setError(null);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className={styles.headerTitle}>AI Assistant</h2>
            <p className={styles.headerSubtitle}>
              {currentArxivId ? (
                <a 
                  href={`https://arxiv.org/abs/${currentArxivId}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={styles.arxivLink}
                >
                  arXiv:{currentArxivId}
                </a>
              ) : (
                'No paper selected'
              )}
            </p>
          </div>
          <a 
            href="https://github.com/montanaflynn/asxiv" 
            target="_blank" 
            rel="noopener noreferrer"
            className={styles.githubLink}
            title="View source on GitHub"
          >
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
        </div>
      </div>
      <div className={styles.messages} role="log" aria-live="polite">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`${styles.message} ${msg.isBot ? styles.bot : styles.user} ${msg.isError ? styles.error : ''}`}
            role={msg.isBot ? 'assistant' : 'user'}
          >
            {msg.isBot ? (
              <>
                <MarkdownWithPageLinks content={msg.text} />
                {msg.structured?.suggestedQuestions && (
                  <SuggestedQuestions 
                    questions={msg.structured.suggestedQuestions}
                    onQuestionClick={handleSuggestedQuestionClick}
                  />
                )}
              </>
            ) : (
              msg.text
            )}
          </div>
        ))}
        {isLoading && (
          <div className={`${styles.message} ${styles.bot} ${styles.loading}`}>
            <span className={styles.loadingDots}>●●●</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className={styles.inputRow}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={isLoading ? "AI is typing..." : "Type a message…"}
          className={styles.input}
          aria-label="Type your message"
          disabled={isLoading || !currentArxivId}
        />
        <button 
          type="submit" 
          className={styles.sendButton} 
          aria-label="Send message"
          disabled={isLoading || !message.trim() || !currentArxivId}
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default ChatWidget;

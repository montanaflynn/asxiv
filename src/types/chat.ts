// Structured chat response types
export interface SuggestedQuestion {
  text: string;
  description?: string; // Optional tooltip text explaining what this question explores
}

export interface StructuredChatResponse {
  // Main response content (markdown format)
  content: string;
  
  // Context-aware suggested questions based on current conversation
  suggestedQuestions?: SuggestedQuestion[];
  
  // Response type for UI handling
  responseType?: 'welcome' | 'answer' | 'clarification' | 'error';
}

// Current message interface (keeping for backwards compatibility)
export interface Message {
  id: string;
  text: string; // This could now contain structured JSON or plain text
  isBot: boolean;
  timestamp: Date;
  isError?: boolean;
  
  // New optional structured data
  structured?: StructuredChatResponse;
}

// API response format
export interface ChatApiResponse {
  // Backwards compatible plain text
  response?: string;
  
  // New structured format
  structured?: StructuredChatResponse;
}

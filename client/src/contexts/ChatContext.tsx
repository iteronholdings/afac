import { createContext, useContext, useState } from "react";

type ChatContextType = {
  openChat: (reviewerId?: number) => void;
};

export const ChatContext = createContext<ChatContextType>({ openChat: () => {} });

export function useChatContext() {
  return useContext(ChatContext);
}

export function ChatProvider({
  children,
  onOpen,
}: {
  children: React.ReactNode;
  onOpen: (reviewerId?: number) => void;
}) {
  return (
    <ChatContext.Provider value={{ openChat: onOpen }}>
      {children}
    </ChatContext.Provider>
  );
}

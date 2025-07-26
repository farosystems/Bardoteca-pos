"use client";

import { BreadcrumbBar } from "@/components/BreadcrumbBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { IconRobot, IconPhoto, IconSettings, IconBarcode, IconSend, IconSparkles, IconArrowUp } from "@tabler/icons-react";
import { useState, useRef, useEffect } from "react";
import { useUser } from "@clerk/nextjs";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

// Función para guardar mensajes en sessionStorage
const saveMessagesToStorage = (messages: Message[]) => {
  try {
    const messagesForStorage = messages.map(msg => ({
      ...msg,
      timestamp: msg.timestamp.toISOString() // Convertir Date a string para sessionStorage
    }));
    sessionStorage.setItem('faroai-chat-messages', JSON.stringify(messagesForStorage));
  } catch (error) {
    console.error('Error al guardar mensajes en sessionStorage:', error);
  }
};

// Función para cargar mensajes desde sessionStorage
const loadMessagesFromStorage = (): Message[] => {
  try {
    const stored = sessionStorage.getItem('faroai-chat-messages');
    if (stored) {
      const parsedMessages = JSON.parse(stored);
      return parsedMessages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp) // Convertir string de vuelta a Date
      }));
    }
  } catch (error) {
    console.error('Error al cargar mensajes desde sessionStorage:', error);
  }
  return [];
};

export default function AsistenteAIPage() {
  const { user } = useUser();
  const [pregunta, setPregunta] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const currentUserIdRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToTop = () => {
    messagesContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop } = messagesContainerRef.current;
      setShowScrollTop(scrollTop > 300); // Mostrar botón después de 300px de scroll
    }
  };

  // Detectar cambios de usuario y limpiar conversación
  useEffect(() => {
    const currentUserId = user?.id || null;
    
    // Si es la primera carga o cambió el usuario
    if (currentUserIdRef.current === null) {
      // Primera carga - cargar mensajes de sessionStorage
      const storedMessages = loadMessagesFromStorage();
      setMessages(storedMessages);
      currentUserIdRef.current = currentUserId;
    } else if (currentUserIdRef.current !== currentUserId) {
      // Cambió el usuario - limpiar conversación
      setMessages([]);
      sessionStorage.removeItem('faroai-chat-messages');
      currentUserIdRef.current = currentUserId;
    }
  }, [user?.id]);

  // Guardar mensajes en sessionStorage cada vez que cambien
  useEffect(() => {
    if (messages.length > 0) {
      saveMessagesToStorage(messages);
    }
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pregunta.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: pregunta,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setPregunta("");
    setIsLoading(true);

    try {
      // Verificar que la variable de entorno esté configurada
      const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;
      if (!webhookUrl) {
        throw new Error('Webhook URL no configurada');
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: pregunta,
          timestamp: new Date().toISOString(),
          messageId: userMessage.id,
          sessionId: Date.now().toString(),
          userAgent: navigator.userAgent,
          language: navigator.language,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      
      // Procesar la respuesta de la IA - ajustado para n8n
      let aiResponse = '';
      
      // n8n puede devolver la respuesta en diferentes formatos
      if (data && typeof data === 'object') {
        // Si data tiene una propiedad 'A output' (formato n8n)
        if (data['A output']) {
          aiResponse = data['A output'];
        }
        // Si data tiene una propiedad 'output' o 'response'
        else if (data.output) {
          aiResponse = data.output;
        }
        else if (data.response) {
          aiResponse = data.response;
        }
        // Si data tiene una propiedad 'message'
        else if (data.message) {
          aiResponse = data.message;
        }
        // Si data tiene una propiedad 'text'
        else if (data.text) {
          aiResponse = data.text;
        }
        // Si data tiene una propiedad 'content'
        else if (data.content) {
          aiResponse = data.content;
        }
        // Si data es un array y tiene elementos
        else if (Array.isArray(data) && data.length > 0) {
          const firstItem = data[0];
          if (firstItem['A output']) {
            aiResponse = firstItem['A output'];
          } else if (firstItem.output) {
            aiResponse = firstItem.output;
          } else if (firstItem.response) {
            aiResponse = firstItem.response;
          } else if (typeof firstItem === 'string') {
            aiResponse = firstItem;
          }
        }
        // Si data es un string directo
        else if (typeof data === 'string') {
          aiResponse = data;
        }
      }
      // Si data es directamente un string
      else if (typeof data === 'string') {
        aiResponse = data;
      }
      
      // Si no se encontró respuesta válida
      if (!aiResponse) {
        console.log('Respuesta recibida de n8n:', data);
        aiResponse = 'Lo siento, no pude procesar tu mensaje. Por favor, intenta de nuevo.';
      }

      // Limpiar y formatear la respuesta
      aiResponse = aiResponse.trim();
      
      // Si la respuesta está vacía, mostrar mensaje por defecto
      if (!aiResponse) {
        aiResponse = 'Lo siento, no recibí una respuesta válida. Por favor, intenta de nuevo.';
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: aiResponse,
        isUser: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      
      let errorMessage = 'Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.';
      
      if (error instanceof Error) {
        if (error.message.includes('Webhook URL no configurada')) {
          errorMessage = 'Error de configuración: Webhook no configurado. Contacta al administrador.';
        } else if (error.message.includes('Error HTTP')) {
          errorMessage = 'Error de conexión con el servidor. Verifica tu conexión e intenta de nuevo.';
        }
      }
      
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: errorMessage,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSugerencia = (sugerencia: string) => {
    setPregunta(sugerencia);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-[#00adde]/10 via-white to-[#011031]/5 relative overflow-hidden">
      {/* Header con breadcrumb - siempre visible */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-[#00adde]/20 px-6 py-4 relative z-10 sticky top-0">
        <BreadcrumbBar />
      </div>

      {/* Chat Container - ocupa el resto del espacio */}
      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-4 md:px-8 py-6 relative z-10">
        {/* Mensajes con scroll interno */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto space-y-6 mb-6 scrollbar-thin scrollbar-thumb-[#00adde] scrollbar-track-transparent relative"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
              {/* Título principal con animación */}
              <div className="text-center space-y-4">
                <div className="relative inline-block">
                  <div className="w-20 h-20 mx-auto bg-gradient-to-br from-[#00adde] to-[#011031] rounded-full flex items-center justify-center mb-4 animate-pulse">
                    <IconRobot className="w-10 h-10 text-white" />
                    <IconSparkles className="w-5 h-5 text-white absolute -top-1 -right-1 animate-bounce" />
                  </div>
                </div>
                <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#00adde] to-[#011031] bg-clip-text text-transparent leading-tight">
                  ¿En qué puedo ayudarte?
                </h1>
                <p className="text-lg text-gray-600 max-w-md mx-auto text-center leading-relaxed">
                  Soy FaroAI, tu asistente inteligente. Puedo ayudarte con consultas sobre productos, 
                  análisis de datos, y mucho más.
                </p>
              </div>

              {/* Sugerencias */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl">
                <Card 
                  className="p-4 hover:shadow-lg transition-all duration-300 cursor-pointer border-[#00adde]/20 hover:border-[#00adde] bg-white/80 backdrop-blur-sm"
                  onClick={() => handleSugerencia("Necesito una imagen de producto")}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#00adde] to-[#011031] rounded-lg flex items-center justify-center">
                      <IconPhoto className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#011031]">Imagen de Producto</h3>
                      <p className="text-sm text-gray-600">Generar imágenes</p>
                    </div>
                  </div>
                </Card>

                <Card 
                  className="p-4 hover:shadow-lg transition-all duration-300 cursor-pointer border-[#00adde]/20 hover:border-[#00adde] bg-white/80 backdrop-blur-sm"
                  onClick={() => handleSugerencia("Ayúdame con un plan de negocios")}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#00adde] to-[#011031] rounded-lg flex items-center justify-center">
                      <IconSettings className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#011031]">Plan de Negocios</h3>
                      <p className="text-sm text-gray-600">Estrategias y análisis</p>
                    </div>
                  </div>
                </Card>

                <Card 
                  className="p-4 hover:shadow-lg transition-all duration-300 cursor-pointer border-[#00adde]/20 hover:border-[#00adde] bg-white/80 backdrop-blur-sm"
                  onClick={() => handleSugerencia("Necesito un código de producto")}
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#00adde] to-[#011031] rounded-lg flex items-center justify-center">
                      <IconBarcode className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[#011031]">Código de Producto</h3>
                      <p className="text-sm text-gray-600">Generar códigos</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Disclaimer */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-md">
                <p className="text-sm text-amber-800 text-center">
                  <strong>FaroAI</strong> puede cometer errores. Verifica siempre la información importante.
                </p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] ${message.isUser ? 'order-2' : 'order-1'}`}>
                    {!message.isUser && (
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-8 h-8 bg-[#011031] rounded-full flex items-center justify-center">
                          <IconRobot className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-medium text-[#011031]">FaroAI</span>
                      </div>
                    )}
                    <div
                      className={`p-4 rounded-2xl ${
                        message.isUser
                          ? 'bg-[#00adde] text-white rounded-br-md'
                          : 'bg-white text-gray-800 rounded-bl-md shadow-sm border border-gray-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.text}</p>
                    </div>
                    <div className={`text-xs text-gray-500 mt-1 ${message.isUser ? 'text-right' : 'text-left'}`}>
                      {message.timestamp.toLocaleTimeString('es-ES', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        hour12: true 
                      })}
                    </div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[80%]">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-8 h-8 bg-[#011031] rounded-full flex items-center justify-center">
                        <IconRobot className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-sm font-medium text-[#011031]">FaroAI</span>
                    </div>
                    <div className="bg-white text-gray-800 rounded-2xl rounded-bl-md shadow-sm border border-gray-100 p-4">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-[#00adde] rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-[#00adde] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-[#00adde] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Botón Volver al tope */}
        {showScrollTop && (
          <div className="absolute bottom-20 right-6 z-20">
            <Button
              onClick={scrollToTop}
              className="w-12 h-12 rounded-full bg-[#00adde] hover:bg-[#011031] transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center"
              title="Volver al tope"
            >
              <IconArrowUp className="w-5 h-5 text-white" />
            </Button>
          </div>
        )}

        {/* Input de mensaje */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex space-x-3">
            <Input
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              placeholder="Escribe tu mensaje..."
              className="flex-1 rounded-full border-[#00adde]/30 focus:border-[#00adde] focus:ring-[#00adde]/20 bg-white/90 backdrop-blur-sm"
              disabled={isLoading}
            />
            <Button
              type="submit"
              disabled={!pregunta.trim() || isLoading}
              className="w-12 h-12 rounded-full bg-[#00adde] hover:bg-[#011031] transition-colors duration-200 flex items-center justify-center"
            >
              <IconSend className="w-5 h-5 text-white" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
} 
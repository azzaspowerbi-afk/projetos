/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, type ReactNode, type FC, Component } from "react";
import Markdown from "react-markdown";
import { CheckCircle2, RefreshCw, Moon, Sun, Target, MessageSquare, ClipboardList, BarChart3, Clock, Zap, Plus, X, Search, Trash2, LogIn, LogOut, User as UserIcon, Pencil, ChevronDown, ExternalLink, Upload, Image as ImageIcon, Loader2, Share2, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { auth, db, googleProvider, storage } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy, Timestamp, updateDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

const ADMIN_EMAILS = ["victor.nascimento@usereserva.com", "azzaspowerbi@gmail.com"];

const getDirectImageUrl = (url: string) => {
  if (!url) return "";
  
  // Google Drive
  const driveMatch = url.match(/\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://lh3.googleusercontent.com/u/0/d/${driveMatch[1]}`;
  }
  
  return url;
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
          <h1 className="mb-4 text-3xl font-bold text-foreground">Ops! Algo deu errado.</h1>
          <p className="mb-6 text-muted-foreground">Ocorreu um erro inesperado na aplicação.</p>
          <div className="max-w-2xl overflow-auto rounded-lg bg-muted p-4 text-left text-xs font-mono text-muted-foreground">
            {this.state.error?.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-8 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground shadow-lg transition-all hover:scale-105"
          >
            Recarregar Página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Project {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  category: string;
  createdAt: number;
  imagePosition?: number;
  content?: string;
  impact?: string;
  status?: string;
}

interface ProjectCardProps {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  category: string;
  createdAt: number;
  imagePosition?: number;
  content?: string;
  impact?: string;
  status?: string;
  isAdmin?: boolean;
  index: number;
  onDelete?: () => void;
  onEdit?: () => void;
}

const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDark]);

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="fixed right-10 top-20 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#274566]/80 backdrop-blur-md text-[#A0C6ED] shadow-2xl transition-all duration-300 hover:scale-110 cursor-pointer border border-white/10"
      aria-label="Alternar tema"
    >
      {isDark ? <Moon className="h-6 w-6" /> : <Sun className="h-6 w-6" />}
    </button>
  );
};

const ThemeToggleSmall = ({ isDark: initialDark }: { isDark: boolean }) => {
  const [isDark, setIsDark] = useState(initialDark);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDark]);

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="p-2 rounded-full hover:bg-white/5 transition-colors text-white/50 hover:text-white"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
};

const ProjectCard: FC<ProjectCardProps> = ({ id, title, description, imageUrl, category, createdAt, imagePosition = 50, content: initialContent, impact = "Alto", status = "Concluído", isAdmin, index, onDelete, onEdit }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [tempContent, setTempContent] = useState(initialContent || "");
  const [isUploadingContent, setIsUploadingContent] = useState(false);
  const [contentImageUrlInput, setContentImageUrlInput] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('project') === id) {
      setIsDetailsOpen(true);
      // Scroll to the project card
      const element = document.getElementById(`project-${id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [id]);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}?project=${id}`;
    
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        setIsCopied(true);
      } else {
        // Fallback for non-secure contexts or older browsers
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          setIsCopied(true);
        } catch (err) {
          console.error('Fallback copy failed', err);
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('Copy failed', err);
    }
    
    if (navigator.clipboard || document.execCommand) {
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleContentImageUrlAdd = (url: string) => {
    if (!url) return;
    const directUrl = getDirectImageUrl(url);
    const markdownImage = `\n\n![Imagem](${directUrl})\n\n`;
    setTempContent(prev => prev + markdownImage);
    setContentImageUrlInput("");
  };

  const handleSaveContent = async () => {
    try {
      // Use setDoc with merge: true to handle cases where the project might not be in Firestore yet (demo projects)
      await setDoc(doc(db, "projects", id), {
        title,
        description,
        imageUrl: imageUrl || "",
        category,
        createdAt,
        imagePosition,
        content: tempContent,
        impact,
        status
      }, { merge: true });
      setIsEditingContent(false);
    } catch (error) {
      console.error("Error updating content:", error);
      alert("Erro ao salvar o conteúdo.");
    }
  };

  const handleContentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!auth.currentUser) {
      alert("Você precisa estar logado para fazer upload.");
      return;
    }

    setIsUploadingContent(true);
    console.log("Iniciando upload de imagem de conteúdo:", file.name);
    
    try {
      const storageRef = ref(storage, `content/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log(`Upload do conteúdo: ${progress.toFixed(2)}% concluído`);
        }, 
        (error) => {
          console.error("Erro no upload do conteúdo:", error);
          if (error.code === 'storage/retry-limit-exceeded') {
            alert("ERRO DE CONEXÃO (CORS): O upload foi bloqueado pelo servidor do Google. \n\nPara resolver, você PRECISA rodar o comando gsutil no Cloud Shell do seu projeto (conforme as instruções enviadas no chat).");
          } else if (error.code === 'storage/unauthorized') {
            alert("ERRO DE PERMISSÃO: Verifique se as 'Rules' do Storage no console do Firebase permitem escrita.");
          } else {
            alert("Erro no upload: " + error.message);
          }
          setIsUploadingContent(false);
        }, 
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          console.log("URL do conteúdo obtida:", url);
          const markdownImage = `\n\n![${file.name}](${url})\n\n`;
          setTempContent(prev => prev + markdownImage);
          setIsUploadingContent(false);
          console.log("Processo de upload de conteúdo finalizado com sucesso.");
        }
      );
    } catch (err) {
      console.error("Erro inesperado no upload do conteúdo:", err);
      alert("Erro inesperado: " + (err instanceof Error ? err.message : String(err)));
      setIsUploadingContent(false);
    }
  };

  return (
    <>
      <motion.div 
        id={`project-${id}`}
        layout
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.6, delay: Math.min(index * 0.1, 0.5) }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="group relative flex flex-col overflow-hidden rounded-[2.5rem] border border-border bg-card transition-all hover:border-primary/30 hover:shadow-2xl mb-16"
      >
        {/* Image Container */}
        <div 
          className="relative aspect-[21/9] overflow-hidden md:aspect-[21/7] bg-muted cursor-zoom-in"
          onClick={() => setIsZoomed(true)}
        >
          <img 
            src={getDirectImageUrl(imageUrl) || `https://picsum.photos/seed/${title}/1600/600`} 
            alt={title}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 image-render-quality"
            referrerPolicy="no-referrer"
            style={{ 
              imageRendering: 'auto',
              objectPosition: `50% ${imagePosition}%`
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/10 to-transparent opacity-40 transition-opacity group-hover:opacity-30" />
          <div className="absolute bottom-8 left-10">
            <span className="rounded-full bg-primary px-5 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white backdrop-blur-md shadow-xl">
              {category}
            </span>
          </div>
        </div>

      <div className="flex flex-1 flex-col p-10 md:p-16">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-px w-12 bg-primary/30" />
            <span className="text-[11px] font-bold uppercase tracking-[0.4em] text-muted-foreground">
              {new Date(createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
            {onEdit && (
              <button 
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="p-2.5 rounded-full bg-muted hover:bg-primary/10 hover:text-primary transition-all text-muted-foreground"
                title="Editar projeto"
              >
                <Pencil className="h-5 w-5" />
              </button>
            )}
            {onDelete && (
              <button 
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-2.5 rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive transition-all text-muted-foreground"
                title="Excluir projeto"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        <h3 className="mb-8 font-display text-4xl font-bold leading-tight text-foreground md:text-5xl group-hover:text-primary transition-colors">
          {title}
        </h3>
        
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <p className="text-lg leading-relaxed text-muted-foreground md:text-xl font-light">
            {description}
          </p>
        </div>

        <div className="mt-12 flex items-center justify-between pt-10 border-t border-border/50">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsDetailsOpen(true)}
              className="group/btn flex items-center gap-4 text-xs font-bold uppercase tracking-[0.3em] text-primary transition-all hover:tracking-[0.4em]"
            >
              Veja Mais 
              <Zap className="h-5 w-5 transition-transform group-hover/btn:scale-125 group-hover/btn:rotate-12" />
            </button>
            <button 
              onClick={handleShare}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors min-w-[100px]"
              title="Copiar link do projeto"
            >
              {isCopied ? (
                <div key="copied" className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  <span>Copiado!</span>
                </div>
              ) : (
                <div key="share" className="flex items-center gap-2">
                  <Share2 className="h-4 w-4" />
                  <span>Compartilhar</span>
                </div>
              )}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-8">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Impacto</span>
              <span className="text-xs font-bold text-foreground">{impact}</span>
            </div>
            <div className="h-8 w-px bg-border/50" />
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">Status</span>
              <span className={`text-xs font-bold ${
                status === "Concluído" ? "text-green-500" :
                status === "Em Andamento" ? "text-amber-500" :
                "text-blue-500"
              }`}>{status}</span>
            </div>
          </div>
        </div>
      </div>
      </motion.div>

      {/* Details Modal */}
      <AnimatePresence>
        {isDetailsOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 md:p-8 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDetailsOpen(false)}
              className="fixed inset-0 bg-background/80 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.95 }}
              className="relative z-10 w-full max-w-5xl bg-card rounded-[2.5rem] border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="relative h-64 md:h-80 w-full shrink-0">
                <img 
                  src={getDirectImageUrl(imageUrl) || `https://picsum.photos/seed/${title}/1600/600`} 
                  alt={title}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                  style={{ objectPosition: `50% ${imagePosition}%` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
                <button 
                  onClick={() => setIsDetailsOpen(false)}
                  className="absolute top-6 right-6 p-3 rounded-full bg-black/20 hover:bg-black/40 text-white transition-all backdrop-blur-md"
                >
                  <X className="h-6 w-6" />
                </button>
                <div className="absolute bottom-8 left-10 right-10">
                  <span className="inline-block rounded-full bg-primary px-5 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white backdrop-blur-md shadow-xl mb-4">
                    {category}
                  </span>
                  <h2 className="text-3xl md:text-5xl font-display font-bold text-foreground leading-tight">
                    {title}
                  </h2>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-10 md:p-16 custom-scrollbar">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-4">
                      <div className="h-px w-12 bg-primary/30" />
                      <span className="text-[11px] font-bold uppercase tracking-[0.4em] text-muted-foreground">
                        Publicado em {new Date(createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                    {isAdmin && !isEditingContent && (
                      <button 
                        onClick={() => {
                          setTempContent(initialContent || "");
                          setIsEditingContent(true);
                        }}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 px-4 py-2 rounded-full transition-all"
                      >
                        <Pencil className="h-3 w-3" />
                        Editar Conteúdo
                      </button>
                    )}
                  </div>

                  <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed mb-12 font-light border-l-4 border-primary/20 pl-8 italic">
                    {description}
                  </p>

                  {isEditingContent ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                      <div className="flex flex-col md:flex-row justify-between items-center bg-muted/50 p-4 rounded-t-2xl border-x border-t border-border gap-4">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-full md:w-auto">Editor de Conteúdo</span>
                        
                        <div className="flex items-center gap-4 w-full md:w-auto">
                          <div className="relative flex-1 md:w-64">
                            <input
                              type="text"
                              value={contentImageUrlInput}
                              onChange={e => setContentImageUrlInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleContentImageUrlAdd(contentImageUrlInput);
                                }
                              }}
                              placeholder="Cole link da imagem (Drive, etc)..."
                              className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                            />
                            {contentImageUrlInput && (
                              <button
                                onClick={() => handleContentImageUrlAdd(contentImageUrlInput)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-primary hover:text-primary/80"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            )}
                          </div>

                          <div className="h-4 w-px bg-border hidden md:block" />

                          <div className="relative">
                            <button
                              type="button"
                              disabled={isUploadingContent}
                              className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-primary hover:text-primary/80 transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              {isUploadingContent ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              Upload
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleContentImageUpload}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                      <textarea
                        value={tempContent}
                        onChange={e => setTempContent(e.target.value)}
                        className="w-full rounded-b-2xl border border-border bg-background px-6 py-6 focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[400px] text-foreground font-mono text-sm leading-relaxed"
                        placeholder="Use Markdown para adicionar imagens, listas e textos formatados..."
                      />
                      <div className="flex justify-end gap-3 pt-4">
                        <button 
                          onClick={() => setIsEditingContent(false)}
                          className="px-6 py-2.5 rounded-full border border-border text-[10px] font-bold uppercase tracking-widest hover:bg-muted transition-all"
                        >
                          Cancelar
                        </button>
                        <button 
                          onClick={handleSaveContent}
                          className="px-8 py-2.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest shadow-lg hover:scale-105 transition-all"
                        >
                          Salvar Alterações
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="markdown-body prose prose-lg dark:prose-invert max-w-none prose-headings:font-display prose-headings:font-bold prose-p:text-muted-foreground prose-p:leading-relaxed prose-img:rounded-2xl prose-img:shadow-xl">
                      {initialContent ? (
                        <Markdown
                          components={{
                            img: ({ node, ...props }) => (
                              <img 
                                {...props} 
                                src={getDirectImageUrl(props.src || "")} 
                                referrerPolicy="no-referrer" 
                                className="rounded-2xl shadow-xl mx-auto"
                              />
                            )
                          }}
                        >
                          {initialContent}
                        </Markdown>
                      ) : (
                        <div className="py-20 text-center border-2 border-dashed border-border rounded-3xl">
                          <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                          <p className="text-muted-foreground/50 font-medium">Nenhum detalhe adicional disponível para este projeto.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-8 border-t border-border/50 bg-muted/30 flex justify-center shrink-0">
                <button 
                  onClick={() => setIsDetailsOpen(false)}
                  className="px-10 py-4 rounded-full bg-primary text-primary-foreground font-bold text-sm uppercase tracking-widest hover:scale-105 transition-all shadow-lg"
                >
                  Fechar Detalhes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lightbox / Zoom Modal */}
      <AnimatePresence>
        {isZoomed && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsZoomed(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative z-10 max-h-full max-w-full overflow-hidden rounded-2xl shadow-2xl"
            >
              <img 
                src={getDirectImageUrl(imageUrl) || `https://picsum.photos/seed/${title}/1600/600`} 
                alt={title}
                className="max-h-[90vh] w-auto object-contain"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={() => setIsZoomed(false)}
                className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md"
              >
                <X className="h-6 w-6" />
              </button>
              <div className="absolute bottom-6 left-6 right-6 p-6 bg-gradient-to-t from-black/80 to-transparent text-white">
                <h4 className="text-xl font-bold">{title}</h4>
                <p className="text-sm text-white/70 mt-1">{category}</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

const INITIAL_PROJECTS: Project[] = [
  {
    id: "1",
    title: "Ferramenta de Controle de Suprimentos 2.0",
    description: "Centralização e automação dos principais processos da cadeia de suprimentos. Integração total de módulos de requisições, estoque e inventário para máxima eficiência operacional.",
    imageUrl: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=1200",
    category: "Automação",
    createdAt: new Date("2026-01-10").getTime(),
    impact: "Crítico",
    status: "Concluído",
    content: `
## Visão Geral do Projeto

Este projeto visou transformar a gestão de suprimentos de uma operação logística de grande escala. Através da centralização de dados e automação de fluxos de trabalho, conseguimos reduzir o tempo de processamento de pedidos em 40%.

### Principais Funcionalidades

*   **Módulo de Requisições Inteligente:** Predição de demanda baseada em histórico.
*   **Controle de Estoque em Tempo Real:** Sincronização instantânea entre múltiplos armazéns.
*   **Inventário Automatizado:** Uso de scanners e IA para conferência rápida.

![Logística](https://images.unsplash.com/photo-1566576721346-d4a3b4eaad5b?auto=format&fit=crop&q=80&w=1200)

### Resultados Alcançados

1.  **Redução de Custos:** Economia de 15% em compras emergenciais.
2.  **Acuracidade:** Precisão de inventário elevada para 99.8%.
3.  **Satisfação:** Feedback positivo de 95% dos usuários internos.
    `
  },
  {
    id: "2",
    title: "Repaginamento do RDO",
    description: "Reestruturação completa do Relatório Diário de Operações. Novo design focado em clareza de dados e suporte imediato à tomada de decisão estratégica no CD.",
    imageUrl: "https://images.unsplash.com/photo-1551288049-bbda4833effb?auto=format&fit=crop&q=80&w=1200",
    category: "BI & Analytics",
    createdAt: new Date("2026-02-15").getTime(),
    impact: "Alto",
    status: "Concluído",
    content: `
## Transformação de Dados em Decisões

O Relatório Diário de Operações (RDO) era anteriormente uma planilha complexa e de difícil leitura. O novo dashboard traz clareza visual e indicadores de performance (KPIs) em tempo real.

### O que mudou?

*   **Design Minimalista:** Foco no que realmente importa para a operação.
*   **Alertas Automáticos:** Notificações instantâneas para desvios de produtividade.
*   **Acesso Mobile:** Decisões tomadas diretamente do chão do CD.

![Dashboard](https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200)

> "A clareza dos novos relatórios mudou a forma como gerenciamos nossas metas diárias." - Gerente de Operações
    `
  },
  {
    id: "3",
    title: "Projeto FIT – Instrução de Trabalho",
    description: "Padronização rigorosa de processos através de Fichas de Instrução de Trabalho. Redução drástica de erros e aumento da produtividade nas linhas operacionais.",
    imageUrl: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=80&w=1200",
    category: "Processos",
    createdAt: new Date("2026-03-01").getTime(),
    impact: "Médio",
    status: "Em Andamento",
    content: `
## Padronização para Excelência

O Projeto FIT (Ficha de Instrução de Trabalho) foca no capital humano. Através de guias visuais e passos claros, padronizamos as tarefas mais críticas da operação.

### Metodologia

1.  **Mapeamento:** Identificação de gargalos e variações de processo.
2.  **Documentação:** Criação de guias visuais de alta qualidade.
3.  **Treinamento:** Capacitação das equipes com foco na nova norma.

![Treinamento](https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&q=80&w=1200)
    `
  },
  {
    id: "4",
    title: "Chatbot Integrado ao Master Data",
    description: "Acesso instantâneo a informações gerenciais via interface conversacional. Automação inteligente via n8n para consulta e tratamento de dados em tempo real.",
    imageUrl: "https://images.unsplash.com/photo-1531746790731-6c087fecd05a?auto=format&fit=crop&q=80&w=1200",
    category: "IA & Chatbots",
    createdAt: new Date("2026-03-10").getTime(),
    impact: "Alto",
    status: "Concluído",
    content: `
## IA a Serviço da Logística

Integramos um chatbot inteligente diretamente ao nosso Master Data. Agora, qualquer colaborador autorizado pode consultar status de estoque ou pedidos via chat.

### Tecnologia Utilizada

*   **n8n:** Orquestração de fluxos de dados.
*   **OpenAI API:** Processamento de linguagem natural.
*   **PostgreSQL:** Base de dados robusta para consultas rápidas.

![IA](https://images.unsplash.com/photo-1531746790731-6c087fecd05a?auto=format&fit=crop&q=80&w=1200)
    `
  },
  {
    id: "5",
    title: "Binfit: Alocação Inteligente",
    description: "Lógica avançada para otimização de espaço nos bins. Critérios de volume e giro de estoque para reduzir o tempo de separação e maximizar a densidade de armazenagem.",
    imageUrl: "https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&q=80&w=1200",
    category: "Otimização",
    createdAt: new Date("2026-03-15").getTime(),
    impact: "Alto",
    status: "Planejado",
    content: `
## Otimização de Espaço e Tempo

O Binfit é um algoritmo de alocação que considera não apenas o tamanho do produto, mas também sua frequência de saída (giro).

### Benefícios

*   **Picking 20% mais rápido.**
*   **Aproveitamento de espaço 15% superior.**
*   **Ergonomia:** Itens de alto giro alocados em posições de fácil acesso.

![Armazém](https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=1200)
    `
  }
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("TODOS");
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const [newProject, setNewProject] = useState({
    title: "",
    description: "",
    imageUrl: "",
    category: "Geral",
    createdAt: Date.now(),
    imagePosition: 50,
    content: "",
    impact: "Alto",
    status: "Concluído"
  });

  const isAdmin = useMemo(() => {
    return user && user.email && ADMIN_EMAILS.includes(user.email);
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firestoreProjects = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Project[];
      
      // Merge Firestore projects with initial projects
      // Firestore projects take precedence if IDs match
      const merged = [...firestoreProjects];
      INITIAL_PROJECTS.forEach(ip => {
        if (!merged.find(p => p.id === ip.id)) {
          merged.push(ip);
        }
      });
      
      setProjects(merged);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "projects");
    });

    return () => unsubscribe();
  }, [isAuthReady]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        return;
      }
      console.error("Login Error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) {
      if (!user) alert("Você precisa estar logado para fazer upload.");
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione uma imagem válida.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 5MB.');
      return;
    }

    setIsUploading(true);
    console.log("Iniciando upload da imagem principal:", file.name);

    try {
      const storageRef = ref(storage, `projects/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log(`Upload principal: ${progress.toFixed(2)}% concluído`);
        },
        (error) => {
          console.error("Erro no upload principal:", error);
          if (error.code === 'storage/retry-limit-exceeded') {
            alert("ERRO DE CONEXÃO (CORS): O upload foi bloqueado pelo servidor do Google. \n\nPara resolver, você PRECISA rodar o comando gsutil no Cloud Shell do seu projeto.");
          } else if (error.code === 'storage/unauthorized') {
            alert("ERRO DE PERMISSÃO: Verifique as Rules do Storage.");
          } else {
            alert("Erro ao fazer upload da imagem: " + error.message);
          }
          setIsUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log("URL principal obtida:", downloadURL);
          setNewProject({ ...newProject, imageUrl: downloadURL });
          setIsUploading(false);
          console.log("Processo de upload principal finalizado com sucesso.");
        }
      );
    } catch (error) {
      console.error("Erro inesperado no upload principal:", error);
      alert("Erro inesperado: " + (error instanceof Error ? error.message : String(error)));
      setIsUploading(false);
    }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    try {
      let timestamp = typeof newProject.createdAt === 'string' ? new Date(newProject.createdAt).getTime() : newProject.createdAt;
      if (isNaN(timestamp)) timestamp = Date.now();

      const projectData = {
        ...newProject,
        createdAt: timestamp
      };

      if (editingProjectId) {
        try {
          // Use setDoc instead of updateDoc to handle initial projects that might not be in Firestore yet
          await setDoc(doc(db, "projects", editingProjectId), projectData);
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `projects/${editingProjectId}`);
        }
      } else {
        try {
          await addDoc(collection(db, "projects"), projectData);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, "projects");
        }
      }
      setIsModalOpen(false);
      setEditingProjectId(null);
      setNewProject({ 
        title: "", 
        description: "", 
        imageUrl: "", 
        category: "Geral", 
        createdAt: Date.now(), 
        imagePosition: 50,
        content: "",
        impact: "Alto",
        status: "Concluído"
      });
    } catch (error) {
      console.error("Save Project Error:", error);
    }
  };

  const handleEditClick = (project: Project) => {
    if (!isAdmin) return;
    setEditingProjectId(project.id);
    setNewProject({
      title: project.title,
      description: project.description,
      imageUrl: project.imageUrl || "",
      category: project.category,
      createdAt: project.createdAt,
      imagePosition: project.imagePosition || 50,
      content: project.content || "",
      impact: project.impact || "Alto",
      status: project.status || "Concluído"
    });
    setIsModalOpen(true);
  };

  const handleDeleteProject = async (id: string) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, "projects", id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${id}`);
    }
  };

  const categories = useMemo(() => {
    const baseCategories = ["OTIMIZAÇÃO", "IA & CHATBOTS", "PROCESSOS", "BI & ANALYTICS", "AUTOMAÇÃO"];
    const projectCategories = projects.map(p => p.category.toUpperCase());
    const uniqueCategories = Array.from(new Set([...baseCategories, ...projectCategories]));
    return ["TODOS", ...uniqueCategories.sort()];
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesCategory = selectedCategory === "TODOS" || p.category.toUpperCase() === selectedCategory;
      const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           p.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [projects, selectedCategory, searchQuery]);

  const sortedProjects = useMemo(() => {
    return [...filteredProjects].sort((a, b) => b.createdAt - a.createdAt);
  }, [filteredProjects]);

  return (
    <div className="min-h-screen bg-background selection:bg-primary/30">
      <ThemeToggle />
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#121212] border-b border-white/5 h-16 flex items-center justify-between px-8">
        <div className="relative">
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            onMouseEnter={() => setIsDropdownOpen(true)}
            className="flex items-center gap-2 text-[14px] font-medium text-white/80 hover:text-white transition-all uppercase tracking-[0.2em] py-2"
          >
            TODOS
            <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                onMouseLeave={() => setIsDropdownOpen(false)}
                className="absolute top-full left-0 mt-1 w-72 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-[60]"
              >
                <div className="py-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-6 py-4 text-[11px] font-bold uppercase tracking-[0.25em] transition-all ${
                        selectedCategory === cat 
                          ? 'bg-primary/10 text-primary border-l-2 border-primary' 
                          : 'text-white/40 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-6 flex-1 max-w-xl mx-8">
          <div className="relative w-full group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 group-focus-within:text-primary transition-colors" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar projetos..."
              className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-12 pr-4 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:bg-white/10 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            {!user ? (
              <button
                onClick={handleLogin}
                className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/60 hover:text-white transition-colors"
              >
                <LogIn className="h-4 w-4" />
                Login
              </button>
            ) : (
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center border border-white/5 overflow-hidden">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-[10px] font-bold text-white/40">{user.displayName?.[0]}</span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/90">{user.displayName?.split(' ')[0]}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#FF5A5A] hover:text-[#FF3333] transition-colors"
                >
                  SAIR
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Floating Add Button */}
      {isAdmin && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="fixed right-6 bottom-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-primary/50 cursor-pointer"
          aria-label="Adicionar projeto"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Modal Form */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-2xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-foreground dark:text-white">{editingProjectId ? "Editar Projeto" : "Novo Projeto"}</h2>
                <button 
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingProjectId(null);
                      setNewProject({ 
                        title: "", 
                        description: "", 
                        imageUrl: "", 
                        category: "Geral", 
                        createdAt: Date.now(), 
                        imagePosition: 50,
                        content: "",
                        impact: "Alto",
                        status: "Concluído"
                      });
                  }}
                  className="rounded-full p-2 hover:bg-muted transition-colors text-foreground dark:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAddProject} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Título do Projeto</label>
                  <input
                    required
                    type="text"
                    value={newProject.title}
                    onChange={e => setNewProject({...newProject, title: e.target.value})}
                    className="w-full rounded-xl border border-border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                    placeholder="Ex: Expansão de Doca"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Categoria</label>
                    <input
                      type="text"
                      value={newProject.category}
                      onChange={e => setNewProject({...newProject, category: e.target.value})}
                      className="w-full rounded-xl border border-border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                      placeholder="Ex: Automação"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Data de Publicação</label>
                    <input
                      type="date"
                      value={(() => {
                        try {
                          const d = new Date(newProject.createdAt);
                          return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
                        } catch {
                          return new Date().toISOString().split('T')[0];
                        }
                      })()}
                      onChange={e => {
                        const d = new Date(e.target.value);
                        if (!isNaN(d.getTime())) {
                          setNewProject({...newProject, createdAt: d.getTime()});
                        }
                      }}
                      className="w-full rounded-xl border border-border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Impacto</label>
                    <select
                      value={newProject.impact}
                      onChange={e => setNewProject({...newProject, impact: e.target.value})}
                      className="w-full rounded-xl border border-border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                    >
                      <option value="Baixo">Baixo</option>
                      <option value="Médio">Médio</option>
                      <option value="Alto">Alto</option>
                      <option value="Crítico">Crítico</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</label>
                    <select
                      value={newProject.status}
                      onChange={e => setNewProject({...newProject, status: e.target.value})}
                      className="w-full rounded-xl border border-border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                    >
                      <option value="Concluído">Concluído</option>
                      <option value="Em Andamento">Em Andamento</option>
                      <option value="Planejado">Planejado</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Imagem do Projeto</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div 
                        className={`relative aspect-video rounded-xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3 overflow-hidden bg-muted/20 ${
                          isUploading ? 'border-primary/50' : 'border-border hover:border-primary/30'
                        }`}
                      >
                        {newProject.imageUrl ? (
                          <>
                            <img 
                              src={getDirectImageUrl(newProject.imageUrl)} 
                              alt="Preview" 
                              className="absolute inset-0 w-full h-full object-cover opacity-50" 
                            />
                            <div className="relative z-10 flex flex-col items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setNewProject({ ...newProject, imageUrl: "" })}
                                className="p-2 rounded-full bg-destructive/80 text-white hover:bg-destructive transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            {isUploading ? (
                              <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            ) : (
                              <Upload className="h-8 w-8 text-muted-foreground/50" />
                            )}
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                              {isUploading ? "Enviando..." : "Upload de Imagem"}
                            </p>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={isUploading}
                          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          <ExternalLink className="h-4 w-4" />
                        </div>
                        <input
                          type="text"
                          value={newProject.imageUrl}
                          onChange={e => setNewProject({...newProject, imageUrl: getDirectImageUrl(e.target.value)})}
                          className="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground text-sm"
                          placeholder="Ou cole a URL da imagem aqui..."
                        />
                      </div>
                      <p className="text-[9px] text-muted-foreground italic px-1">
                        Dica: Você pode fazer o upload ou colar um link direto.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 p-4 bg-muted/30 rounded-2xl border border-border/50">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Posição Vertical (Foco)</label>
                    <span className="text-[10px] font-mono text-primary">{newProject.imagePosition}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={newProject.imagePosition}
                    onChange={(e) => setNewProject({...newProject, imagePosition: parseInt(e.target.value)})}
                    className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[8px] text-muted-foreground uppercase font-bold tracking-tighter">
                    <span>Topo</span>
                    <span>Centro</span>
                    <span>Base</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Descrição Detalhada (Card)</label>
                  <textarea
                    required
                    value={newProject.description}
                    onChange={e => setNewProject({...newProject, description: e.target.value})}
                    className="w-full rounded-xl border border-border bg-background px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[100px] text-foreground"
                    placeholder="Descreva o objetivo e impacto do projeto..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-primary py-3.5 font-bold text-primary-foreground shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  {editingProjectId ? "Salvar Alterações" : "Publicar Projeto"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Project Feed - Infinite Style */}
      <div className="mx-auto max-w-5xl px-6 py-32">
        <div className="flex flex-col">
          <AnimatePresence mode="popLayout">
            {sortedProjects.map((project, index) => (
              <ProjectCard 
                key={project.id}
                {...project}
                index={index}
                isAdmin={isAdmin}
                onDelete={isAdmin ? () => handleDeleteProject(project.id) : undefined}
                onEdit={isAdmin ? () => handleEditClick(project) : undefined}
              />
            ))}
          </AnimatePresence>
        </div>

        {sortedProjects.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-32 text-center"
          >
            <div className="h-20 w-20 rounded-3xl bg-muted flex items-center justify-center mb-6">
              <Search className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Nenhum projeto encontrado</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Tente ajustar sua pesquisa ou categoria para encontrar o que procura.
            </p>
            <button 
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("TODOS");
              }}
              className="mt-8 text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
            >
              Limpar todos os filtros
            </button>
          </motion.div>
        )}
      </div>

      <footer className="py-20 text-center border-t border-border mt-24 bg-card/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-primary/5 pointer-events-none" />
        <div className="relative z-10 max-w-4xl mx-auto px-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.4em] mb-4">
            Logistics Intelligence Dashboard
          </p>
          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-[0.2em]">
            © {new Date().getFullYear()} • Desenvolvido para Excelência Operacional
          </p>
        </div>
      </footer>

      {/* Scroll to Top */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed left-6 bottom-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-card border border-border text-foreground shadow-2xl transition-all hover:scale-110 hover:border-primary/50 group"
          >
            <ChevronDown className="h-6 w-6 rotate-180 group-hover:-translate-y-1 transition-transform" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

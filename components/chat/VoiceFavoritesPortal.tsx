import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    ChevronLeft,
    ChevronRight,
    MessageSquare,
    Pause,
    Play,
    Star,
    Trash,
    X,
} from "lucide-react";
import {
    VOICE_FAVORITES_CHANGED_EVENT,
    getVoiceFavoriteBlob,
    listVoiceFavorites,
    removeVoiceFavoriteById,
    voiceFavoriteSourceLabel,
    type VoiceFavorite,
    type VoiceFavoriteSource,
} from "@/lib/voice-favorites";

const PAGE_SIZE = 10;
type VoiceSourceFilter = "all" | VoiceFavoriteSource;

interface FavoritesPortalProps {
    onClose: () => void;
    onJumpToMessage?: (charId: string, messageId: string) => void;
}

const voiceFilters: Array<{ value: VoiceSourceFilter; label: string }> = [
    { value: "all", label: "全部" },
    { value: "chat", label: "聊天" },
    { value: "call", label: "通话" },
    { value: "date", label: "见面" },
];

export const FavoritesPortal: React.FC<FavoritesPortalProps> = ({ onClose, onJumpToMessage }) => {
    const [voiceItems, setVoiceItems] = useState<VoiceFavorite[]>([]);
    const [voiceFilter, setVoiceFilter] = useState<VoiceSourceFilter>("all");
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [audioError, setAudioError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const objectUrlRef = useRef<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const voices = await listVoiceFavorites();
            setVoiceItems(voices);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
        window.addEventListener(VOICE_FAVORITES_CHANGED_EVENT, refresh);
        return () => {
            window.removeEventListener(VOICE_FAVORITES_CHANGED_EVENT, refresh);
        };
    }, [refresh]);

    useEffect(() => () => {
        audioRef.current?.pause();
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    }, []);

    const filteredVoices = useMemo(
        () => voiceFilter === "all" ? voiceItems : voiceItems.filter(item => item.source === voiceFilter),
        [voiceFilter, voiceItems],
    );
    const pageCount = Math.max(1, Math.ceil(filteredVoices.length / PAGE_SIZE));
    const visibleItems = filteredVoices.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    useEffect(() => {
        setPage(0);
        setAudioError(null);
    }, [voiceFilter]);

    const stopPlayback = useCallback(() => {
        audioRef.current?.pause();
        setPlayingId(null);
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
    }, []);

    const playVoice = async (item: VoiceFavorite) => {
        setAudioError(null);
        if (playingId === item.id) {
            stopPlayback();
            return;
        }
        stopPlayback();
        const blob = await getVoiceFavoriteBlob(item.id);
        if (!blob) {
            setAudioError("该音频文件缺失，请重新收藏。");
            return;
        }
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        const audio = audioRef.current || new Audio();
        audioRef.current = audio;
        audio.src = url;
        audio.onended = stopPlayback;
        audio.onerror = () => {
            stopPlayback();
            setAudioError("音频暂时无法播放。");
        };
        try {
            await audio.play();
            setPlayingId(item.id);
        } catch {
            stopPlayback();
            setAudioError("播放被拦截，请再次点击。");
        }
    };

    const removeVoice = async (item: VoiceFavorite) => {
        if (playingId === item.id) stopPlayback();
        await removeVoiceFavoriteById(item.id);
        setVoiceItems(previous => previous.filter(candidate => candidate.id !== item.id));
    };

    const portal = (
        <div className="favorites-root">
            <style>{`
                .favorites-root { position: fixed; inset: 0; z-index: 1650; overflow: hidden; color: #172033; background: #f4f1eb; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; animation: favoritesEnter .22s ease-out both; }
                .favorites-shell { height: 100%; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; background: #f8f7f2; }
                .favorites-list { scrollbar-width: none; }
                .favorites-list::-webkit-scrollbar { display: none; }
                .favorite-row { animation: favoriteRowEnter .18s ease both; }
                @keyframes favoritesEnter { from { opacity: 0; } to { opacity: 1; } }
                @keyframes favoriteRowEnter { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
            <div className="favorites-shell px-4 pb-10">
                <header className="shrink-0 pt-10 pb-3 border-b border-slate-900/10">
                    <div className="flex items-center justify-between gap-4 h-12">
                        <button type="button" onClick={onClose} className="w-10 h-10 -ml-1 grid place-items-center rounded-full text-slate-600 active:bg-black/5" aria-label="关闭">
                            <X size={21} strokeWidth={2} />
                        </button>
                        <div className="min-w-0 text-center">
                            <h1 className="text-[17px] font-bold tracking-[.12em]">语音收藏</h1>
                            <p className="mt-0.5 text-[10px] text-slate-500">共收藏 {voiceItems.length} 条语音</p>
                        </div>
                        <Star size={20} className="w-10 text-amber-500 fill-amber-500" />
                    </div>
                    <div className="flex items-center justify-center gap-1 mt-3">
                        {voiceFilters.map(option => (
                            <button
                                type="button"
                                key={option.value}
                                onClick={() => setVoiceFilter(option.value)}
                                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${voiceFilter === option.value ? "bg-slate-800 text-white" : "text-slate-500 active:bg-black/5"}`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </header>

                <main className="favorites-list flex-1 min-h-0 overflow-y-auto pt-2">
                    {loading ? (
                        <div className="h-full grid place-items-center text-sm text-slate-400">正在加载收藏…</div>
                    ) : visibleItems.length === 0 ? (
                        <div className="h-full min-h-64 grid place-items-center text-center px-8">
                            <div>
                                <Star size={34} className="mx-auto text-slate-300" />
                                <p className="mt-4 text-sm font-bold text-slate-500">这里还没有语音收藏</p>
                                <p className="mt-1.5 text-xs leading-5 text-slate-400">在聊天气泡长按，或者拔打电话时，就能将好听的语音收藏到这里。</p>
                            </div>
                        </div>
                    ) : (
                        visibleItems.map(item => {
                            const active = playingId === item.id;
                            const hasTranslation = !!item.translation && item.translation.trim() !== item.originalText.trim();
                            return (
                                <article key={item.id} className="favorite-row flex gap-3 py-4 border-b border-slate-900/10">
                                    <button
                                        type="button"
                                        onClick={() => void playVoice(item)}
                                        className={`mt-0.5 shrink-0 w-10 h-10 grid place-items-center rounded-full transition-colors ${active ? "bg-amber-500 text-white" : "bg-slate-800 text-white active:bg-slate-700"}`}
                                        aria-label={active ? "暂停" : "播放"}
                                    >
                                        {active ? <Pause size={16} className="fill-white" /> : <Play size={16} className="ml-0.5 fill-white" />}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                            <span className="font-bold text-slate-700">{item.charName}</span>
                                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{voiceFavoriteSourceLabel(item.source)}</span>
                                            <time>{new Date(item.sourceTimestamp).toLocaleDateString()}</time>
                                        </div>
                                        <p className="mt-2 text-[13px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">{item.originalText || "（无文字）"}</p>
                                        {hasTranslation && (
                                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500 whitespace-pre-wrap break-words">
                                                <span className="mr-1.5 text-[9px] font-bold text-amber-700">翻译</span>
                                                {item.translation}
                                            </p>
                                        )}
                                        {onJumpToMessage && item.source === "chat" && (
                                            <button
                                                type="button"
                                                onClick={() => onJumpToMessage(item.charId, item.sourceKey)}
                                                className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:underline"
                                            >
                                                <MessageSquare size={10} />
                                                <span>定位到聊天</span>
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void removeVoice(item)}
                                        className="self-start shrink-0 w-8 h-8 grid place-items-center rounded-full text-slate-400 active:bg-rose-50 active:text-rose-500"
                                        aria-label="取消收藏"
                                    >
                                        <Trash size={15} />
                                    </button>
                                </article>
                            );
                        })
                    )}
                </main>

                {audioError && <div className="shrink-0 py-2 text-center text-[11px] text-rose-600">{audioError}</div>}
                <footer className="shrink-0 min-h-[50px] pt-2 flex items-center justify-between border-t border-slate-900/10">
                    <button type="button" disabled={page === 0} onClick={() => setPage(value => Math.max(0, value - 1))} className="w-8 h-8 grid place-items-center rounded-full text-slate-600 disabled:opacity-20 active:bg-black/5" aria-label="上一页"><ChevronLeft size={16} strokeWidth={2.5} /></button>
                    <span className="text-[10px] text-slate-500">第 {page + 1} / {pageCount} 页</span>
                    <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} className="w-8 h-8 grid place-items-center rounded-full text-slate-600 disabled:opacity-20 active:bg-black/5" aria-label="下一页"><ChevronRight size={16} strokeWidth={2.5} /></button>
                </footer>
            </div>
        </div>
    );

    return typeof document !== "undefined" ? createPortal(portal, document.body) : null;
};
export default FavoritesPortal;

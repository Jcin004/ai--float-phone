import { saveThemeAssetFromBlob, getThemeAssetDataUrl, deleteThemeAsset } from "./theme-storage";

export type VoiceFavoriteSource = "chat" | "call" | "date" | "story";

export interface VoiceFavorite {
    id: string;
    source: VoiceFavoriteSource;
    sourceKey: string;
    /** 原消息所在会话，跳转回原文用 */
    sessionId?: string;
    /** 是否带音频；纯文字收藏没有音频 */
    hasAudio?: boolean;
    charId: string;
    charName: string;
    sourceTimestamp: number;
    favoritedAt: number;
    originalText: string;
    spokenText?: string;
    translation?: string;
    language?: string;
}

export interface SaveVoiceFavoriteInput extends Omit<VoiceFavorite, "id" | "favoritedAt"> {
    /** 音频快照；纯文字收藏没有音频，可省略 */
    blob?: Blob;
}

const STORAGE_KEY = "ai_phone_voice_favorites_v2";
export const VOICE_FAVORITES_CHANGED_EVENT = "ai_phone:voice-favorites-changed";

// 广播事件
const notifyChanged = () => {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(VOICE_FAVORITES_CHANGED_EVENT));
    }
};

// 获取收藏元数据列表
export async function listVoiceFavorites(): Promise<VoiceFavorite[]> {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const items = JSON.parse(raw);
        return Array.isArray(items) ? items : [];
    } catch {
        return [];
    }
}

// 检查是否已收藏
export async function getVoiceFavorite(source: VoiceFavoriteSource, sourceKey: string): Promise<VoiceFavorite | null> {
    const list = await listVoiceFavorites();
    const id = `${source}_${sourceKey}`;
    return list.find(item => item.id === id) || null;
}

// 保存收藏
export async function saveVoiceFavorite(input: SaveVoiceFavoriteInput): Promise<VoiceFavorite> {
    const hasAudio = input.blob instanceof Blob && input.blob.size > 0;

    const id = `${input.source}_${input.sourceKey}`;
    const now = Date.now();
    
    // 1. 将音频 Blob 存入 theme_db 换取持久化引用 ID（底层是 dataUrl）
    const audioAssetId = hasAudio
        ? await saveThemeAssetFromBlob(input.blob as Blob, "voice_msg" as any, `voice_fav_${id}`)
        : undefined;

    const favorite: VoiceFavorite = {
        id,
        source: input.source,
        sourceKey: input.sourceKey,
        sessionId: input.sessionId,
        hasAudio,
        charId: input.charId,
        charName: input.charName || "未知角色",
        sourceTimestamp: input.sourceTimestamp || now,
        favoritedAt: now,
        originalText: input.originalText || "",
        spokenText: input.spokenText,
        translation: input.translation,
        language: input.language,
    };

    const current = await listVoiceFavorites();
    const updated = [favorite, ...current.filter(item => item.id !== id)];
    
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    notifyChanged();
    return favorite;
}

// 删除收藏
export async function removeVoiceFavoriteById(id: string): Promise<boolean> {
    const current = await listVoiceFavorites();
    if (!current.some(item => item.id === id)) return false;

    // 1. 从数据库中删除音频大文件
    await deleteThemeAsset(`voice_fav_${id}`).catch(() => {});

    // 2. 从列表中删除元数据
    const updated = current.filter(item => item.id !== id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    notifyChanged();
    return true;
}

// 获取收藏的音频 Blob 文件
export async function getVoiceFavoriteBlob(id: string): Promise<Blob | null> {
    const dataUrl = await getThemeAssetDataUrl(`voice_fav_${id}`);
    if (!dataUrl) return null;
    try {
        const response = await fetch(dataUrl);
        return await response.blob();
    } catch {
        return null;
    }
}

export function voiceFavoriteSourceLabel(source: VoiceFavoriteSource): string {
    return {
        chat: "聊天",
        call: "通话",
        date: "见面",
        story: "剧情",
    }[source];
}

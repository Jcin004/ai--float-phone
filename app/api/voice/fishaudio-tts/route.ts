import { NextResponse } from "next/server";
import { proxyFetch } from "@/lib/proxy-fetch";

export const runtime = "nodejs";
export const maxDuration = 30;

const FISH_UPSTREAM = "https://api.fish.audio/v1/tts";

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
        const baseUrl = typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : "https://api.fish.audio/v1";
        const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "s2.1-pro-free";

        const payload = { ...(body.payload || {}) };

        if (!apiKey) {
            return NextResponse.json({ error: "missing_api_key", message: "缺少鱼声 API Key" }, { status: 400 });
        }

        const upstreamUrl = `${baseUrl.replace(/\/$/, "")}/tts`;

        const response = await proxyFetch(upstreamUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                model: model,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => "");
            return NextResponse.json(
                { error: "upstream_error", message: `鱼声上游请求失败 (HTTP ${response.status}): ${errText}` },
                { status: response.status }
            );
        }

        const arrayBuffer = await response.arrayBuffer();
        const contentType = response.headers.get("content-type") || "audio/mpeg";

        return new NextResponse(arrayBuffer, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: "proxy_failed", message: message.slice(0, 500) }, { status: 502 });
    }
}

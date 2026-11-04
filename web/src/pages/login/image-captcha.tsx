import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Button, Input } from "antd";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getImageCaptcha } from "@/services/api/new-api-auth";
import type { ImageVerification } from "@/types/auth";

export type ImageCaptchaHandle = { reload: () => Promise<void> };

export function ImageCaptcha({ onChange, ref }: { onChange: (value: ImageVerification) => void; ref?: Ref<ImageCaptchaHandle> }) {
    const { t } = useTranslation();
    const [captcha, setCaptcha] = useState<{ id: string; image: string } | null>(null);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const sequence = useRef(0);
    const reload = useCallback(async () => {
        const current = ++sequence.current;
        setBusy(true);
        setFailed(false);
        setCaptcha(null);
        setCode("");
        onChange({ id: "", code: "" });
        try {
            const data = await getImageCaptcha();
            if (typeof data?.id !== "string" || !data?.image?.startsWith("data:image/png;base64,")) throw new Error("Invalid CAPTCHA");
            if (sequence.current === current) setCaptcha(data);
        } catch {
            if (sequence.current === current) setFailed(true);
        } finally {
            if (sequence.current === current) setBusy(false);
        }
    }, [onChange]);
    useImperativeHandle(ref, () => ({ reload }), [reload]);
    useEffect(() => {
        void reload();
        return () => {
            sequence.current += 1;
        };
    }, [reload]);
    return (
        <div className="mb-6">
            <label htmlFor="image-captcha-code" className="mb-2 block text-sm">
                {t("auth.imageCaptcha")}
            </label>
            <div className="flex items-center gap-3">
                <Input
                    id="image-captcha-code"
                    size="large"
                    value={code}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={t("auth.imageCaptchaPlaceholder")}
                    disabled={!captcha || busy}
                    onChange={(event) => {
                        setCode(event.target.value);
                        onChange({ id: captcha?.id || "", code: event.target.value });
                    }}
                />
                <Button className="!h-11 !w-32 !shrink-0 !rounded-lg !p-0" disabled={busy} onClick={() => void reload()} aria-label={t("auth.refreshCaptcha")}>
                    {captcha ? <img src={captcha.image} alt={t("auth.imageCaptcha")} className="h-full w-full rounded-lg object-contain" /> : <RefreshCw size={16} className={busy ? "animate-spin" : ""} />}
                </Button>
            </div>
            {failed ? (
                <p role="alert" className="mt-2 text-xs text-red-600">
                    {t("auth.captchaUnavailable")}
                </p>
            ) : null}
        </div>
    );
}

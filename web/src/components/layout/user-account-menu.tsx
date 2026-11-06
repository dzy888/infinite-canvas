import { useState } from "react";
import { App, Button, Dropdown } from "antd";
import { LogIn, LogOut, UserRound, Wallet, Grid2X2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AuthError, signOut } from "@/services/api/new-api-auth";
import { usePlatformStore } from "@/stores/use-platform-store";
import { formatQuota } from "@/services/api/new-api-platform";
import { useUserStore } from "@/stores/use-user-store";

export function UserAccountMenu() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const location = useLocation();
    const user = useUserStore((state) => state.user);
    const { account, quotaSettings } = usePlatformStore();
    const [busy, setBusy] = useState(false);
    const logout = async () => {
        setBusy(true);
        try {
            await signOut();
            navigate("/", { replace: true });
        } catch (error) {
            message.error(t(error instanceof AuthError ? error.key : "auth.logoutFailed"));
        } finally {
            setBusy(false);
        }
    };

    if (!user)
        return (
            <Button type="primary" size="small" className="!ml-2 !h-8 !px-3" icon={<LogIn size={14} />} onClick={() => navigate("/login", { state: { from: `${location.pathname}${location.search}${location.hash}` } })} aria-label={t("auth.signIn")}>
                <span className="hidden sm:inline">{t("auth.signIn")}</span>
            </Button>
        );

    return (
        <Dropdown
            trigger={["click"]}
            menu={{
                items: [
                    { key: "identity", label: user.display_name || user.username, disabled: true },
                    { key: "account", icon: <UserRound size={14} />, label: t("platform.account"), onClick: () => navigate("/account") },
                    { key: "wallet", icon: <Wallet size={14} />, label: t("wallet.title"), onClick: () => navigate("/account?tab=wallet") },
                    { key: "models", icon: <Grid2X2 size={14} />, label: t("navigation.pricing"), onClick: () => navigate("/pricing") },
                    { key: "profile", icon: <UserRound size={14} />, label: t("profile.title"), onClick: () => navigate("/account?tab=profile") },
                    { type: "divider" as const },
                    { key: "logout", icon: <LogOut size={14} />, label: t("auth.signOut"), disabled: busy, onClick: () => void logout() },
                ],
            }}
        >
            <Button type="text" size="small" className="!ml-1 !h-8 !px-2" loading={busy} icon={<UserRound size={16} />} aria-label={t("auth.accountMenu", { name: user.display_name || user.username })}>
                <span className="hidden max-w-20 truncate xl:inline">{account ? formatQuota(account.quota, quotaSettings) : user.display_name || user.username}</span>
            </Button>
        </Dropdown>
    );
}

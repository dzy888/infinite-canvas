import { useState } from "react";
import { App, Button, Dropdown } from "antd";
import { ArrowUpRight, LogIn, LogOut, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { NEW_API_CONSOLE_URL } from "@/constant/runtime-config";
import { AuthError, signOut } from "@/services/api/new-api-auth";
import { useUserStore } from "@/stores/use-user-store";

export function UserAccountMenu() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const location = useLocation();
    const user = useUserStore((state) => state.user);
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
                    ...(NEW_API_CONSOLE_URL
                        ? [
                              {
                                  key: "account",
                                  icon: <ArrowUpRight size={14} />,
                                  label: (
                                      <a href={NEW_API_CONSOLE_URL} target="_blank" rel="noopener noreferrer">
                                          {t("auth.manageAccount")}
                                      </a>
                                  ),
                              },
                          ]
                        : []),
                    { type: "divider" as const },
                    { key: "logout", icon: <LogOut size={14} />, label: t("auth.signOut"), disabled: busy, onClick: () => void logout() },
                ],
            }}
        >
            <Button type="text" size="small" className="!ml-1 !h-8 !px-2" loading={busy} icon={<UserRound size={16} />} aria-label={t("auth.accountMenu", { name: user.display_name || user.username })}>
                <span className="hidden max-w-20 truncate xl:inline">{user.display_name || user.username}</span>
            </Button>
        </Dropdown>
    );
}

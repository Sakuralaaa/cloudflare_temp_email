<script setup>
import { ref, computed, onMounted } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useHead } from '@unhead/vue'
import { useRoute, useRouter } from 'vue-router'
import { useIsMobile } from '../utils/composables'
import {
    DarkModeOutlined, LightModeOutlined, MenuRound,
    AdminPanelSettingsOutlined, MonitorHeartOutlined,
    KeyboardArrowDownOutlined, OpenInNewOutlined,
    MailOutlineRound, PersonOutlineRound, TranslateRound
} from '@vicons/material'
import { GithubAlt } from '@vicons/fa'

import { useGlobalState } from '../store'
import { api } from '../api'
import { getRouterPathWithLang, hashPassword } from '../utils'
import { DEFAULT_LOCALE, isSupportedLocale, replaceLocaleInFullPath } from '../i18n/utils'
import { getLocaleLabel, SUPPORTED_LOCALES } from '../i18n/locale-registry'
import Turnstile from '../components/Turnstile.vue'

const message = useMessage()
const notification = useNotification()

const {
    toggleDark, isDark, isTelegram, showAdminPage, showUserSystem,
    showAuth, auth, loading, openSettings, preferredLocale, userSettings, useSideMargin
} = useGlobalState()
const route = useRoute()
const router = useRouter()
const isMobile = useIsMobile()

const showMobileMenu = ref(false)
const menuValue = computed(() => {
    if (route.path.includes("user")) return "user";
    if (route.path.includes("admin")) return "admin";
    return "home";
});

const cfToken = ref('')
const turnstileRef = ref(null)

const authFunc = async () => {
    try {
        await api.fetch('/open_api/site_login', {
            method: 'POST',
            body: JSON.stringify({
                password: await hashPassword(auth.value),
                cf_token: cfToken.value
            })
        });
        location.reload()
    } catch (error) {
        message.error(error.message || "error");
        turnstileRef.value?.refresh?.();
    }
}

const languageOptions = SUPPORTED_LOCALES.map((locale) => ({
    label: getLocaleLabel(locale),
    value: locale,
    key: locale,
}))

const currentLocaleLabel = computed(() => {
    return languageOptions.find(opt => opt.value === locale.value)?.label || locale.value;
});

const { t, locale } = useScopedI18n('views.Header')

const changeLocale = async (lang) => {
    if (!isSupportedLocale(lang)) {
        return;
    }

    const currentFullPath = route.fullPath;
    const targetFullPath = replaceLocaleInFullPath(currentFullPath, lang);

    if (lang === locale.value && targetFullPath === currentFullPath) {
        showMobileMenu.value = false;
        return;
    }

    if (lang === DEFAULT_LOCALE) {
        preferredLocale.value = DEFAULT_LOCALE;
    }

    let localeSwitched = false;
    try {
        await router.push({ path: targetFullPath, force: true });
        localeSwitched = router.currentRoute.value.fullPath === targetFullPath;
        if (!localeSwitched) {
            await router.replace({ path: targetFullPath, force: true });
            localeSwitched = router.currentRoute.value.fullPath === targetFullPath;
        }
    } catch (error) {
        console.error('Failed to switch locale', error);
    } finally {
        showMobileMenu.value = false;
    }

    if (localeSwitched) preferredLocale.value = lang;
}

const version = import.meta.env.PACKAGE_VERSION ? `v${import.meta.env.PACKAGE_VERSION}` : "";
const showGithubForCurrentUser = computed(() => {
    if (!openSettings.value.showGithub) return false;
    if (openSettings.value.showGithubForUser) return true;
    return showAdminPage.value;
});

const navItems = computed(() => [
    {
        key: 'home',
        label: t('mailbox'),
        icon: MailOutlineRound,
        show: true,
        action: async () => {
            await router.push(getRouterPathWithLang('/', locale.value));
            showMobileMenu.value = false;
        }
    },
    {
        key: 'user',
        label: t('userCenter'),
        icon: PersonOutlineRound,
        show: showUserSystem.value && !isTelegram.value && !showAdminPage.value,
        action: async () => {
            await router.push(getRouterPathWithLang('/user', locale.value));
            showMobileMenu.value = false;
        }
    },
    {
        key: 'admin',
        label: t('admin'),
        icon: AdminPanelSettingsOutlined,
        show: showAdminPage.value,
        action: async () => {
            loading.value = true;
            await router.push(getRouterPathWithLang('/admin', locale.value));
            loading.value = false;
            showMobileMenu.value = false;
        }
    }
].filter(item => item.show));

useHead({
    title: () => openSettings.value.title || t('title'),
    meta: [
        { name: "description", content: openSettings.value.description || t('title') },
    ]
});

const logoClickCount = ref(0);
const logoClick = async () => {
    if (route.path.includes("admin")) {
        logoClickCount.value = 0;
        return;
    }
    if (logoClickCount.value >= 5) {
        logoClickCount.value = 0;
        message.info("Change to admin Page");
        loading.value = true;
        await router.push(getRouterPathWithLang('/admin', locale.value));
        loading.value = false;
    } else {
        logoClickCount.value++;
    }
    if (logoClickCount.value > 0) {
        message.info(`Click ${5 - logoClickCount.value + 1} times to enter the admin page`);
    }
}

onMounted(async () => {
    await api.getOpenSettings(message, notification);
    if (showUserSystem.value && !userSettings.value.user_id) await api.getUserSettings(message);
});
</script>

<template>
    <header class="app-header">
        <div class="header-inner" :class="{ 'is-full': !isMobile && !useSideMargin }">
            <!-- Brand -->
            <div class="header-brand">
                <button type="button" class="brand-logo-btn" @click="logoClick" aria-label="Logo">
                    <img class="brand-logo" src="/logo.png" alt="Logo" />
                </button>
                <span class="brand-title">{{ openSettings.title || t('title') }}</span>
            </div>

            <!-- Desktop Center Navigation -->
            <nav v-if="!isMobile && navItems.length > 0" class="header-nav" aria-label="Main navigation">
                <button
                    v-for="item in navItems"
                    :key="item.key"
                    type="button"
                    class="nav-pill"
                    :class="{ 'is-active': menuValue === item.key }"
                    @click="item.action"
                >
                    <n-icon :component="item.icon" :size="16" />
                    <span>{{ item.label }}</span>
                </button>
            </nav>

            <!-- Right Controls -->
            <div class="header-actions">
                <a
                    v-if="!isMobile && openSettings?.statusUrl"
                    class="icon-action-btn"
                    :href="openSettings.statusUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="t('status')"
                >
                    <n-icon :component="MonitorHeartOutlined" :size="18" />
                </a>

                <n-dropdown
                    v-if="!isMobile"
                    :options="languageOptions"
                    @select="changeLocale"
                    trigger="click"
                >
                    <button type="button" class="locale-pill-btn">
                        <n-icon :component="TranslateRound" :size="15" />
                        <span>{{ currentLocaleLabel }}</span>
                        <n-icon :component="KeyboardArrowDownOutlined" :size="15" class="chevron" />
                    </button>
                </n-dropdown>

                <a
                    v-if="!isMobile && showGithubForCurrentUser"
                    class="icon-action-btn"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="https://github.com/dreamhunter2333/cloudflare_temp_email"
                    :title="version || 'GitHub'"
                >
                    <n-icon :component="GithubAlt" :size="17" />
                </a>

                <button
                    type="button"
                    class="icon-action-btn"
                    @click="toggleDark()"
                    :title="isDark ? t('light') : t('dark')"
                    :aria-label="isDark ? t('light') : t('dark')"
                >
                    <n-icon :component="isDark ? LightModeOutlined : DarkModeOutlined" :size="18" />
                </button>

                <button
                    v-if="isMobile"
                    type="button"
                    class="icon-action-btn"
                    @click="showMobileMenu = true"
                    :aria-label="t('menu')"
                >
                    <n-icon :component="MenuRound" :size="20" />
                </button>
            </div>
        </div>

        <!-- Mobile Slide-Over Menu Drawer -->
        <n-drawer
            v-model:show="showMobileMenu"
            placement="right"
            :width="290"
            class="mobile-nav-drawer"
        >
            <n-drawer-content :title="openSettings.title || t('title')" closable>
                <div class="drawer-section">
                    <button
                        v-for="item in navItems"
                        :key="item.key"
                        type="button"
                        class="drawer-nav-item"
                        :class="{ 'is-active': menuValue === item.key }"
                        @click="item.action"
                    >
                        <n-icon :component="item.icon" :size="19" />
                        <span>{{ item.label }}</span>
                    </button>
                </div>

                <div class="drawer-divider" />

                <div class="drawer-section">
                    <button
                        type="button"
                        class="drawer-nav-item"
                        @click="toggleDark()"
                    >
                        <n-icon :component="isDark ? LightModeOutlined : DarkModeOutlined" :size="19" />
                        <span>{{ isDark ? t('light') : t('dark') }}</span>
                    </button>

                    <n-dropdown :options="languageOptions" @select="changeLocale" trigger="click" placement="bottom-start">
                        <button type="button" class="drawer-nav-item">
                            <n-icon :component="TranslateRound" :size="19" />
                            <span class="drawer-item-grow">{{ currentLocaleLabel }}</span>
                            <n-icon :component="KeyboardArrowDownOutlined" :size="17" class="drawer-muted-icon" />
                        </button>
                    </n-dropdown>

                    <a
                        v-if="openSettings?.statusUrl"
                        class="drawer-nav-item"
                        target="_blank"
                        rel="noopener noreferrer"
                        :href="openSettings.statusUrl"
                    >
                        <n-icon :component="MonitorHeartOutlined" :size="19" />
                        <span class="drawer-item-grow">{{ t('status') }}</span>
                        <n-icon :component="OpenInNewOutlined" :size="15" class="drawer-muted-icon" />
                    </a>

                    <a
                        v-if="showGithubForCurrentUser"
                        class="drawer-nav-item"
                        target="_blank"
                        rel="noopener noreferrer"
                        href="https://github.com/dreamhunter2333/cloudflare_temp_email"
                    >
                        <n-icon :component="GithubAlt" :size="18" />
                        <span class="drawer-item-grow">{{ version || 'GitHub' }}</span>
                        <n-icon :component="OpenInNewOutlined" :size="15" class="drawer-muted-icon" />
                    </a>
                </div>
            </n-drawer-content>
        </n-drawer>

        <!-- Site Access Password Modal -->
        <n-modal v-model:show="showAuth" :closable="false" :closeOnEsc="false" :maskClosable="false" preset="dialog"
            :title="t('accessHeader')">
            <p class="auth-tip">{{ t('accessTip') }}</p>
            <n-input v-model:value="auth" type="password" show-password-on="click" @keyup.enter="authFunc" />
            <Turnstile ref="turnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="cfToken" />
            <template #action>
                <n-button :loading="loading" @click="authFunc" type="primary">
                    {{ t('ok') }}
                </n-button>
            </template>
        </n-modal>
    </header>
</template>

<style scoped>
.app-header {
    position: sticky;
    top: 0;
    z-index: 40;
    width: 100%;
    height: var(--app-header-height);
    background: var(--app-glass);
    backdrop-filter: saturate(180%) blur(18px);
    -webkit-backdrop-filter: saturate(180%) blur(18px);
    border-bottom: 1px solid var(--app-border);
    padding-top: env(safe-area-inset-top, 0px);
}

.header-inner {
    height: 100%;
    max-width: var(--app-max-width);
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.header-inner.is-full {
    max-width: 100%;
}

.header-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}

.brand-logo-btn {
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    flex-shrink: 0;
}

.brand-logo {
    width: 30px;
    height: 30px;
    border-radius: 9px;
    object-fit: cover;
    box-shadow: var(--app-shadow-xs);
}

.brand-title {
    font-size: 16px;
    font-weight: 650;
    letter-spacing: -0.015em;
    color: var(--app-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.header-nav {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px;
    border-radius: 12px;
    background: var(--app-surface-subtle);
    border: 1px solid var(--app-border);
}

.nav-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 13px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--app-text-secondary);
    font-size: 13.5px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.16s var(--app-ease);
    white-space: nowrap;
}

.nav-pill:hover {
    color: var(--app-text);
}

.nav-pill.is-active {
    background: var(--app-surface);
    color: var(--app-text);
    font-weight: 600;
    box-shadow: var(--app-shadow-xs);
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}

.icon-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--app-text-secondary);
    cursor: pointer;
    text-decoration: none;
    transition: background-color 0.15s var(--app-ease), color 0.15s var(--app-ease);
}

.icon-action-btn:hover {
    background: var(--app-surface-subtle);
    color: var(--app-text);
}

.locale-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 32px;
    padding: 0 10px;
    border-radius: 9px;
    border: 1px solid var(--app-border);
    background: var(--app-surface);
    color: var(--app-text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s var(--app-ease);
}

.locale-pill-btn:hover {
    color: var(--app-text);
    border-color: var(--app-border-strong);
}

.locale-pill-btn .chevron {
    opacity: 0.6;
}

.drawer-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.drawer-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 11px 12px;
    border: 0;
    border-radius: 11px;
    background: transparent;
    color: var(--app-text);
    font-size: 15px;
    font-weight: 500;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.15s var(--app-ease);
}

.drawer-nav-item:hover,
.drawer-nav-item:active {
    background: var(--app-surface-subtle);
}

.drawer-nav-item.is-active {
    background: var(--app-accent-soft);
    color: var(--app-accent);
    font-weight: 600;
}

.drawer-item-grow {
    flex: 1;
    min-width: 0;
}

.drawer-muted-icon {
    color: var(--app-text-muted);
}

.drawer-divider {
    height: 1px;
    background: var(--app-border);
    margin: 12px 0;
}

.auth-tip {
    margin: 0 0 12px;
    color: var(--app-text-secondary);
    font-size: 14px;
    line-height: 1.5;
}

@media (max-width: 767px) {
    .header-inner {
        padding: 0 12px;
    }

    .brand-logo {
        width: 28px;
        height: 28px;
    }

    .brand-title {
        font-size: 15.5px;
    }
}
</style>

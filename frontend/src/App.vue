<script setup>
import {
  darkTheme,
} from 'naive-ui'
import { computed, onMounted, watchEffect } from 'vue'
import { useHead } from '@unhead/vue'
import { useI18n } from 'vue-i18n'
import { useGlobalState } from './store'
import { useIsMobile } from './utils/composables'
import Header from './views/Header.vue';
import Footer from './views/Footer.vue';
import { api } from './api'
import { getNaiveLocaleConfig } from './i18n/naive-locale'
import { DEFAULT_LOCALE, isSupportedLocale } from './i18n/utils'
import { APP_CONFIG } from './config'
import { lightThemeOverrides, darkThemeOverrides } from './styles/naive-theme'

const {
  isDark, loading, useSideMargin, telegramApp, isTelegram
} = useGlobalState()
const adClient = APP_CONFIG.GOOGLE_AD_CLIENT;
const adSlot = APP_CONFIG.GOOGLE_AD_SLOT;
const { locale } = useI18n({ useScope: 'global' });
const theme = computed(() => isDark.value ? darkTheme : null)
const themeOverrides = computed(() => isDark.value ? darkThemeOverrides : lightThemeOverrides)
const localeConfig = computed(() => getNaiveLocaleConfig(isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE))
const isMobile = useIsMobile()
const showSideMargin = computed(() => !isMobile.value && useSideMargin.value);
const showAd = computed(() => !isMobile.value && adClient && adSlot);

watchEffect(() => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = isSupportedLocale(locale.value) ? locale.value : DEFAULT_LOCALE
  document.documentElement.dataset.theme = isDark.value ? 'dark' : 'light'
  const themeColor = isDark.value ? '#0D0F12' : '#F6F7F9'
  const metaTags = document.querySelectorAll('meta[name="theme-color"]')
  metaTags.forEach((meta) => {
    if (!meta.getAttribute('media')) {
      meta.setAttribute('content', themeColor)
    }
  })
})

if (showAd.value) {
  useHead({
    script: [{
      src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`,
      async: true,
      crossorigin: 'anonymous',
    }],
  })
}

onMounted(async () => {
  try {
    await api.getUserSettings();
  } catch (error) {
    console.error(error);
  }

  const token = APP_CONFIG.CF_WEB_ANALY_TOKEN;

  const exist = document.querySelector('script[src="https://static.cloudflareinsights.com/beacon.min.js"]') !== null
  if (token && !exist) {
    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.dataset.cfBeacon = `{ token: ${token} }`;
    document.body.appendChild(script);
  }

  // check if google ad is enabled
  if (showAd.value) {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }

  // check if telegram is enabled
  const enableTelegram = APP_CONFIG.IS_TELEGRAM;
  if (
    (typeof enableTelegram === 'boolean' && enableTelegram === true)
    ||
    (typeof enableTelegram === 'string' && enableTelegram === 'true')
  ) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-web-app.js';
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
    telegramApp.value = window.Telegram?.WebApp || {};
    isTelegram.value = !!window.Telegram?.WebApp?.initData;
  }
});
</script>

<template>
  <n-config-provider
    :locale="localeConfig.locale"
    :date-locale="localeConfig.dateLocale"
    :theme="theme"
    :theme-overrides="themeOverrides"
  >
    <n-global-style />
    <n-spin description="loading..." :show="loading" class="app-root-spin">
      <n-notification-provider container-style="margin-top: 64px;">
        <n-message-provider container-style="margin-top: 16px;">
          <div class="app-shell">
            <Header />
            <div class="app-body" :class="{ 'has-ads': showAd }">
              <aside v-if="showSideMargin && showAd" class="app-side-ad">
                <ins class="adsbygoogle" style="display:block" :data-ad-client="adClient" :data-ad-slot="adSlot"
                  data-ad-format="auto" data-full-width-responsive="true"></ins>
              </aside>
              <main class="app-main" :class="{ 'is-constrained': showSideMargin && !showAd, 'is-full': !showSideMargin }">
                <div class="app-content">
                  <router-view></router-view>
                </div>
                <Footer />
              </main>
              <aside v-if="showSideMargin && showAd" class="app-side-ad">
                <ins class="adsbygoogle" style="display:block" :data-ad-client="adClient" :data-ad-slot="adSlot"
                  data-ad-format="auto" data-full-width-responsive="true"></ins>
              </aside>
            </div>
          </div>
          <n-back-top :right="20" :bottom="isMobile ? 84 : 32" />
        </n-message-provider>
      </n-notification-provider>
    </n-spin>
  </n-config-provider>
</template>

<style>
.n-switch {
  margin-left: 8px;
  margin-right: 8px;
}

.app-root-spin > .n-spin-content {
  min-height: 100dvh;
}
</style>

<style scoped>
.app-shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background-color: var(--app-bg);
  color: var(--app-text);
}

.app-body {
  flex: 1;
  display: flex;
  justify-content: center;
  width: 100%;
  min-width: 0;
}

.app-side-ad {
  width: 180px;
  flex: 0 0 180px;
  padding: 16px 8px;
}

.app-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 16px 24px 0;
}

.app-main.is-constrained {
  max-width: var(--app-max-width);
}

.app-main.is-full {
  max-width: 100%;
  padding: 16px 24px 0;
}

.app-content {
  flex: 1;
  min-width: 0;
}

@media (max-width: 767px) {
  .app-main,
  .app-main.is-full {
    padding: 10px 12px 0;
  }
}
</style>

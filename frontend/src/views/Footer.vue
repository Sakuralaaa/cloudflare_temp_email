<script setup>
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import DOMPurify from 'dompurify'
const { openSettings } = useGlobalState()
const { t } = useScopedI18n('views.Footer')
</script>

<template>
    <footer class="app-footer">
        <div class="footer-content">
            <span>{{ t('copyright') }} © 2023-{{ new Date().getFullYear() }}</span>
            <span v-if="openSettings.copyright" class="footer-dot">·</span>
            <span v-if="openSettings.copyright" class="footer-custom" v-html="DOMPurify.sanitize(openSettings.copyright)"></span>
        </div>
    </footer>
</template>

<style scoped>
.app-footer {
    margin-top: 24px;
    padding: 16px 12px 24px;
    border-top: 1px solid var(--app-border);
    text-align: center;
}

.footer-content {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--app-text-muted);
}

.footer-custom :deep(a) {
    color: var(--app-text-secondary);
    text-decoration: none;
}

.footer-custom :deep(a:hover) {
    color: var(--app-accent);
    text-decoration: underline;
}

.footer-dot {
    opacity: 0.5;
}

@media (max-width: 767px) {
    .app-footer {
        padding-bottom: calc(var(--app-mobile-nav-height) + env(safe-area-inset-bottom, 0px) + 20px);
    }
}
</style>

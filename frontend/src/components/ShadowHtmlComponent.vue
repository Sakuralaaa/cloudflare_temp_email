<template>
    <div class="mail-boundary" :class="{ 'is-dark': isDark }">
        <div v-if="useFallback" class="mail-document" v-html="htmlContent"></div>
        <div v-else ref="shadowHost" class="mail-document"></div>
    </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
    htmlContent: {
        type: String,
        required: true,
    },
    isDark: {
        type: Boolean,
        default: false,
    },
});

const shadowHost = ref(null);
let shadowRoot = null;
const useFallback = ref(false);

/**
 * Renders content into Shadow DOM with fallback to v-html
 */
const renderShadowDom = () => {
    if (!shadowHost.value && !useFallback.value) return;

    try {
        // Don't attempt to use Shadow DOM if already in fallback mode
        if (useFallback.value) return;

        // Initialize Shadow DOM if not already created
        if (!shadowRoot && shadowHost.value) {
            try {
                shadowRoot = shadowHost.value.attachShadow({ mode: 'open' });
            } catch (error) {
                console.warn('Shadow DOM not supported, falling back to v-html:', error);
                useFallback.value = true;
                return;
            }
        }

        // Update content if Shadow DOM exists
        if (shadowRoot) {
            const baseStyle = `<style>
                :host {
                    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "PingFang SC", "Microsoft YaHei", sans-serif;
                    font-size: 14.5px;
                    line-height: 1.65;
                    color: #111827;
                    word-break: break-word;
                }
                img { max-width: 100%; height: auto; }
                table { max-width: 100%; }
                pre { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; margin: 0; }
                a { color: #2563EB; }
            </style>`;
            shadowRoot.innerHTML = baseStyle + props.htmlContent;
        }
    } catch (error) {
        console.error('Failed to render Shadow DOM, falling back to v-html:', error);
        useFallback.value = true;
    }
};

// Initial render when component is mounted
onMounted(() => {
    // Check if Shadow DOM is supported in this browser
    if (typeof Element.prototype.attachShadow !== 'function') {
        console.warn('Shadow DOM is not supported in this browser, using v-html fallback');
        useFallback.value = true;
        return;
    }

    renderShadowDom();
});

// Clean up resources when component is unmounted
onBeforeUnmount(() => {
    if (shadowRoot) {
        shadowRoot.innerHTML = '';
    }
    shadowRoot = null;
});

// Update Shadow DOM when htmlContent or dark mode changes
watch(() => [props.htmlContent, props.isDark], () => {
    renderShadowDom();
}, { flush: 'post' });
</script>

<style scoped>
.mail-boundary {
    all: initial;
    display: block;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    color-scheme: light;
    color: #111827;
    background-color: #ffffff;
    border-radius: 12px;
    padding: 4px 2px;
    overflow-x: auto;
}

.mail-document {
    max-width: 100%;
    min-width: 0;
}

.mail-boundary.is-dark {
    padding: 16px 18px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>

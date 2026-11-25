<script setup>
import { computed, ref } from 'vue';
import { useScopedI18n } from '@/i18n/app';
import { ContentCopyOutlined, CheckRound, LinkRound, KeyRound, OpenInNewOutlined } from '@vicons/material';
import { useMessage } from 'naive-ui';
import { extractLocalOtp } from '../utils/otp-extract';

const message = useMessage();
const copied = ref(false);
let copiedTimer = null;

const { t } = useScopedI18n('components.AiExtractInfo')

const props = defineProps({
  metadata: {
    type: String,
    default: null
  },
  subject: {
    type: String,
    default: ''
  },
  text: {
    type: String,
    default: ''
  },
  compact: {
    type: Boolean,
    default: false
  }
});

const aiExtract = computed(() => {
  if (props.metadata) {
    try {
      const data = JSON.parse(props.metadata);
      if (data?.ai_extract?.result) {
        return data.ai_extract;
      }
    } catch (e) {
      // Ignore invalid metadata JSON and fall back to local extractor
    }
  }
  const localCode = extractLocalOtp(props.subject, props.text);
  if (localCode) {
    return {
      type: 'auth_code',
      result: localCode,
      result_text: localCode,
      isLocal: true,
    };
  }
  return null;
});

const typeLabel = computed(() => {
  if (!aiExtract.value) return '';
  const typeMap = {
    auth_code: t('authCode'),
    auth_link: t('authLink'),
    service_link: t('serviceLink'),
    subscription_link: t('subscriptionLink'),
    other_link: t('otherLink'),
  };
  return typeMap[aiExtract.value.type] || '';
});

const typeIcon = computed(() => {
  if (!aiExtract.value) return null;
  return aiExtract.value.type === 'auth_code' ? KeyRound : LinkRound;
});

const isLink = computed(() => {
  return aiExtract.value && aiExtract.value.type !== 'auth_code';
});

const displayText = computed(() => {
  if (!aiExtract.value) return '';
  if (aiExtract.value.type === 'auth_code') {
    return aiExtract.value.result;
  }
  return aiExtract.value.result_text || aiExtract.value.result;
});

const copyToClipboard = async () => {
  if (!aiExtract.value?.result) return;
  try {
    await navigator.clipboard.writeText(aiExtract.value.result);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copied.value = false }, 1800);
    message.success(t('copySuccess'));
  } catch (e) {
    message.error(t('copyFailed'));
  }
};

const openLink = () => {
  if (isLink.value && aiExtract.value.result) {
    window.open(aiExtract.value.result, '_blank', 'noopener,noreferrer');
  }
};
</script>

<template>
  <div v-if="aiExtract && aiExtract.result" class="ai-extract-info">
    <!-- Full reader banner -->
    <div v-if="!compact" class="extract-banner" :class="{ 'is-code': !isLink }">
      <div class="extract-banner-left">
        <div class="extract-icon-wrap">
          <n-icon :component="typeIcon" :size="18" />
        </div>
        <div class="extract-meta">
          <span class="extract-label">{{ typeLabel }}</span>
          <span v-if="!isLink" class="extract-code">{{ aiExtract.result }}</span>
          <span v-else class="extract-link-text">{{ displayText }}</span>
        </div>
      </div>
      <div class="extract-banner-actions">
        <n-button size="small" type="primary" :secondary="!copied" @click="copyToClipboard">
          <template #icon>
            <n-icon :component="copied ? CheckRound : ContentCopyOutlined" />
          </template>
          {{ copied ? t('copySuccess') : displayText && !isLink ? aiExtract.result : '' }}
        </n-button>
        <n-button v-if="isLink" size="small" tertiary type="primary" @click="openLink">
          <template #icon>
            <n-icon :component="OpenInNewOutlined" />
          </template>
          {{ t('open') }}
        </n-button>
      </div>
    </div>

    <!-- Compact list pill (clickable without opening mail) -->
    <button
      v-else
      type="button"
      class="extract-pill"
      :class="{ 'is-copied': copied }"
      @click.stop="copyToClipboard"
      :title="`${typeLabel}: ${aiExtract.result}`"
    >
      <n-icon :component="copied ? CheckRound : typeIcon" :size="13" />
      <span class="extract-pill-label">{{ typeLabel }}</span>
      <span class="extract-pill-value">{{ displayText }}</span>
    </button>
  </div>
</template>

<style scoped>
.ai-extract-info {
  margin-bottom: 10px;
}

.extract-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 13px;
  background: var(--app-accent-soft);
  border: 1px solid var(--app-accent-border);
}

.extract-banner-left {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  flex: 1;
}

.extract-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--app-surface);
  color: var(--app-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: var(--app-shadow-xs);
}

.extract-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.extract-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--app-accent);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.extract-code {
  font-size: 20px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  letter-spacing: 0.12em;
  color: var(--app-text);
  line-height: 1.25;
}

.extract-link-text {
  font-size: 13.5px;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.extract-banner-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.extract-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid var(--app-accent-border);
  background: var(--app-accent-soft);
  color: var(--app-accent);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: transform 0.12s var(--app-ease), background-color 0.15s var(--app-ease);
}

.extract-pill:active {
  transform: scale(0.97);
}

.extract-pill.is-copied {
  background: var(--app-success-soft);
  border-color: rgba(22, 163, 74, 0.25);
  color: var(--app-success);
}

.extract-pill-label {
  opacity: 0.8;
  flex-shrink: 0;
}

.extract-pill-value {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-weight: 700;
  letter-spacing: 0.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

<script setup>
import { computed } from 'vue';
import { useGlobalState } from '../store';
import { utcToLocalDate } from '../utils';
import AiExtractInfo from './AiExtractInfo.vue';
import { useScopedI18n } from '@/i18n/app';

const { useUTCDate, isDark } = useGlobalState();
const { t } = useScopedI18n('components.MailContentRenderer');

const props = defineProps({
  mail: { type: Object, required: true },
  showEMailTo: { type: Boolean, default: true },
  enableMailReadStatus: { type: Boolean, default: false },
  previewLineClamp: { type: Number, default: 0 },
});

const receivedAt = computed(() => new Date(`${props.mail.created_at} UTC`));

const isUnread = computed(() => props.enableMailReadStatus && props.mail.is_unread === 1);

const senderName = computed(() => {
  const raw = (props.mail.source || '').trim();
  if (!raw) return '—';
  // Extract display name from "Display Name <email@domain>"
  const angleIdx = raw.indexOf('<');
  if (angleIdx > 0) {
    const name = raw.slice(0, angleIdx).replace(/^["']|["']$/g, '').trim();
    if (name) return name;
  }
  return raw.replace(/^<|>$/g, '');
});

const senderInitial = computed(() => {
  const str = senderName.value.replace(/^[^a-zA-Z0-9\u4e00-\u9fa5]+/, '');
  return (str[0] || '?').toUpperCase();
});

const AVATAR_PALETTES_LIGHT = [
  { bg: '#EBF3FF', fg: '#1D4ED8' },
  { bg: '#EEF2FF', fg: '#4338CA' },
  { bg: '#F3E8FF', fg: '#7E22CE' },
  { bg: '#FCE7F3', fg: '#BE185D' },
  { bg: '#ECFDF5', fg: '#047857' },
  { bg: '#FEF3C7', fg: '#B45309' },
  { bg: '#E0F2FE', fg: '#0369A1' },
];

const AVATAR_PALETTES_DARK = [
  { bg: 'rgba(59, 130, 246, 0.18)', fg: '#93C5FD' },
  { bg: 'rgba(99, 102, 241, 0.2)', fg: '#A5B4FC' },
  { bg: 'rgba(168, 85, 247, 0.2)', fg: '#D8B4FE' },
  { bg: 'rgba(236, 72, 153, 0.18)', fg: '#F9A8D4' },
  { bg: 'rgba(16, 185, 129, 0.18)', fg: '#6EE7B7' },
  { bg: 'rgba(245, 158, 11, 0.18)', fg: '#FCD34D' },
  { bg: 'rgba(14, 165, 233, 0.18)', fg: '#7DD3FC' },
];

const avatarStyle = computed(() => {
  const str = senderName.value || 'mail';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  const palettes = isDark.value ? AVATAR_PALETTES_DARK : AVATAR_PALETTES_LIGHT;
  const pick = palettes[Math.abs(hash) % palettes.length];
  return {
    backgroundColor: pick.bg,
    color: pick.fg,
  };
});

const formattedTime = computed(() => {
  const d = receivedAt.value;
  if (Number.isNaN(d.getTime())) {
    return utcToLocalDate(props.mail.created_at, useUTCDate.value);
  }
  const now = new Date();
  const tz = useUTCDate.value ? 'UTC' : undefined;
  const sameDay =
    d.toLocaleDateString('en-CA', { timeZone: tz }) ===
    now.toLocaleDateString('en-CA', { timeZone: tz });
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
  }
  const sameYear =
    d.toLocaleDateString('en-CA', { year: 'numeric', timeZone: tz }) ===
    now.toLocaleDateString('en-CA', { year: 'numeric', timeZone: tz });
  if (sameYear) {
    return d.toLocaleDateString([], { month: '2-digit', day: '2-digit', timeZone: tz });
  }
  return d.toLocaleDateString([], { year: '2-digit', month: '2-digit', day: '2-digit', timeZone: tz });
});
</script>

<template>
  <div class="mail-summary" :class="{ 'is-unread': isUnread }">
    <div class="mail-avatar-wrap">
      <div class="mail-avatar" :style="avatarStyle" aria-hidden="true">
        {{ senderInitial }}
      </div>
      <span v-if="isUnread" class="mail-unread-dot" />
    </div>

    <div class="mail-body">
      <div class="mail-top-row">
        <div class="mail-sender" :title="mail.source">
          <span v-if="showEMailTo" class="mail-meta-prefix">{{ t('from') }}: </span>{{ senderName }}
        </div>
        <span class="mail-date" :title="utcToLocalDate(mail.created_at, useUTCDate)">
          {{ formattedTime }}
        </span>
      </div>

      <div v-if="showEMailTo" class="mail-recipient" :title="mail.address">
        <span class="mail-meta-prefix">{{ t('to') }}: </span>{{ mail.address }}
      </div>

      <div class="mail-subject" :title="`ID: ${mail.id}\n${mail.subject || ''}`">
        {{ mail.subject || '—' }}
      </div>

      <div v-if="mail.text && previewLineClamp > 0" class="mail-preview" :style="{ '-webkit-line-clamp': previewLineClamp }">
        {{ mail.text }}
      </div>

      <AiExtractInfo :metadata="mail.metadata" :subject="mail.subject" :text="mail.text" compact />
    </div>
  </div>
</template>

<style scoped>
.mail-summary {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  min-width: 0;
  width: 100%;
}

.mail-avatar-wrap {
  position: relative;
  flex-shrink: 0;
  margin-top: 2px;
}

.mail-avatar {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 650;
  user-select: none;
}

.mail-unread-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--app-accent);
  border: 2px solid var(--app-surface);
}

.mail-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mail-top-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.mail-sender {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mail-summary.is-unread .mail-sender,
.mail-summary.is-unread .mail-subject {
  font-weight: 700;
}

.mail-date {
  flex-shrink: 0;
  font-size: 11.5px;
  color: var(--app-text-muted);
  font-variant-numeric: tabular-nums;
}

.mail-recipient {
  font-size: 12px;
  color: var(--app-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mail-meta-prefix {
  color: var(--app-text-muted);
  font-weight: 400;
}

.mail-subject {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--app-text);
  line-height: 1.38;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mail-preview {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--app-text-muted);
  margin-top: 2px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.mail-summary :deep(.ai-extract-info) {
  margin: 5px 0 0;
}
</style>

<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { useThemeVars } from 'naive-ui';
import { useScopedI18n } from '@/i18n/app'
import { CloudDownloadRound, ReplyFilled, ForwardFilled, FullscreenRound, ImageRound, AttachFileRound,
  MarkEmailReadRound, MarkEmailUnreadRound, MoreHorizRound, DeleteOutlineRound, TextSnippetRound, InfoOutlined } from '@vicons/material'
import ShadowHtmlComponent from "./ShadowHtmlComponent.vue";
import AiExtractInfo from "./AiExtractInfo.vue";
import { getDownloadEmlUrl } from '../utils/email-parser';
import { blockRemoteContent } from '../utils/remote-content-policy';
import { utcToLocalDate } from '../utils';
import { useGlobalState } from '../store';

const { preferShowTextMail, useIframeShowMail, useUTCDate, isDark, autoLoadRemoteImages } = useGlobalState();

const { t } = useScopedI18n('components.MailContentRenderer')
const themeVars = useThemeVars();

const props = defineProps({
  mail: {
    type: Object,
    required: true
  },
  showEMailTo: {
    type: Boolean,
    default: true
  },
  enableUserDeleteEmail: {
    type: Boolean,
    default: false
  },
  showReply: {
    type: Boolean,
    default: false
  },
  showSaveS3: {
    type: Boolean,
    default: false
  },
  enableMailReadStatus: {
    type: Boolean,
    default: false
  },
  onDelete: {
    type: Function,
    default: () => { }
  },
  onReply: {
    type: Function,
    default: () => { }
  },
  onForward: {
    type: Function,
    default: () => { }
  },
  onSaveToS3: {
    type: Function,
    default: () => { }
  },
  onUpdateMailReadStatus: {
    type: Function,
    default: () => { }
  }
});

const showTextMail = ref(preferShowTextMail.value);
const showAttachments = ref(false);
const curAttachments = ref([]);
const attachmentLoding = ref(false);
const readStatusUpdating = ref(false);
const showFullscreen = ref(false);
const showMoreActions = ref(false);
const showMailDetails = ref(false);
const moreActionsButton = ref(null);
const downloadMailButton = ref(null);

watch(showMoreActions, async (show) => {
  if (!show) return;
  await nextTick();
  if (showMoreActions.value) downloadMailButton.value?.$el.focus();
});

const showRemoteImages = ref(false);
watch(() => props.mail.id, () => {
  showRemoteImages.value = false;
  showMoreActions.value = false;
  showMailDetails.value = false;
});

const allowRemoteImages = computed(() => autoLoadRemoteImages.value || showRemoteImages.value);

const processedMail = computed(() => {
  if (allowRemoteImages.value) {
    return { message: props.mail.message, blocked: 0 };
  }
  const { html, blocked } = blockRemoteContent(props.mail.message);
  return { message: html, blocked };
});

const shadowMailHtml = computed(() => allowRemoteImages.value
  ? blockRemoteContent(processedMail.value.message, { allowRemoteImages: true }).html
  : processedMail.value.message);

const senderInitial = computed(() => {
  const raw = (props.mail.source || '').trim().replace(/^["'<]+/, '');
  return (raw[0] || '?').toUpperCase();
});

const handleLoadRemoteImages = () => {
  showRemoteImages.value = true;
};

const handleDelete = () => {
  props.onDelete();
};

const handleViewAttachments = () => {
  curAttachments.value = props.mail.attachments;
  showAttachments.value = true;
};

const handleReply = () => {
  props.onReply();
};

const handleForward = () => {
  props.onForward();
};

const closeMoreActions = () => {
  showMoreActions.value = false;
  moreActionsButton.value?.$el.focus();
};

const toggleTextMail = () => {
  showTextMail.value = !showTextMail.value;
  closeMoreActions();
};

const openFullscreen = () => {
  showFullscreen.value = true;
  closeMoreActions();
};

const openMailDetails = () => {
  showMailDetails.value = true;
  closeMoreActions();
};

const handleUpdateMailReadStatus = async () => {
  readStatusUpdating.value = true;
  closeMoreActions();
  try {
    await props.onUpdateMailReadStatus();
  } finally {
    readStatusUpdating.value = false;
  }
};

const handleSaveToS3 = async (filename, blob) => {
  attachmentLoding.value = true;
  try {
    await props.onSaveToS3(filename, blob);
  } finally {
    attachmentLoding.value = false;
  }
};
</script>

<template>
  <div class="mail-content-renderer">
    <!-- Sender & Metadata Header -->
    <div class="mail-header-meta">
      <div class="sender-row">
        <div class="reader-avatar" aria-hidden="true">{{ senderInitial }}</div>
        <div class="sender-info">
          <div class="sender-address" :title="mail.source">{{ mail.source || '—' }}</div>
          <div class="sender-sub">
            <span v-if="showEMailTo" class="recipient-chip">{{ t('to') }}: {{ mail.address }}</span>
            <span class="time-chip">{{ utcToLocalDate(mail.created_at, useUTCDate) }}</span>
          </div>
        </div>
      </div>

      <!-- Action Toolbar -->
      <div class="mail-actions-bar">
        <div class="mail-primary-actions">
          <n-button v-if="showReply" size="small" secondary type="primary" @click="handleReply">
            <template #icon><n-icon :component="ReplyFilled" /></template>
            {{ t('reply') }}
          </n-button>
          <n-button v-if="showReply" size="small" quaternary @click="handleForward">
            <template #icon><n-icon :component="ForwardFilled" /></template>
            {{ t('forward') }}
          </n-button>
          <n-button v-if="mail.attachments?.length" size="small" secondary
            :title="t('attachments')" :aria-label="t('attachments')" @click="handleViewAttachments">
            <template #icon><n-icon :component="AttachFileRound" /></template>
            <span>{{ t('attachments') }} ({{ mail.attachments.length }})</span>
          </n-button>
        </div>

        <div class="mail-secondary-actions">
          <n-popover v-model:show="showMoreActions" trigger="click" placement="bottom-end" :show-arrow="false">
            <template #trigger>
              <n-button ref="moreActionsButton" size="small" quaternary :title="t('moreActions')" :aria-label="t('moreActions')"
                :aria-expanded="showMoreActions" @keydown.esc.stop.prevent="closeMoreActions">
                <template #icon><n-icon :component="MoreHorizRound" /></template>
                {{ t('more') }}
              </n-button>
            </template>
            <div class="mail-more-actions" @keydown.esc.stop.prevent="closeMoreActions">
              <n-button ref="downloadMailButton" tag="a" target="_blank" block quaternary size="small" :download="mail.id + '.eml'"
                :href="getDownloadEmlUrl(mail.raw)" @click="closeMoreActions">
                <template #icon><n-icon :component="CloudDownloadRound" /></template>
                {{ t('downloadMail') }}
              </n-button>
              <n-button v-if="enableMailReadStatus" block quaternary size="small" :loading="readStatusUpdating"
                @click="handleUpdateMailReadStatus">
                <template #icon>
                  <n-icon :component="mail.is_unread === 1 ? MarkEmailReadRound : MarkEmailUnreadRound" />
                </template>
                {{ mail.is_unread === 1 ? t('markAsRead') : t('markAsUnread') }}
              </n-button>
              <n-button block quaternary size="small" @click="toggleTextMail">
                <template #icon><n-icon :component="TextSnippetRound" /></template>
                {{ showTextMail ? t('showHtmlMail') : t('showTextMail') }}
              </n-button>
              <n-button block quaternary size="small" @click="openFullscreen">
                <template #icon><n-icon :component="FullscreenRound" /></template>
                {{ t('fullscreen') }}
              </n-button>
              <n-button block quaternary size="small" @click="openMailDetails">
                <template #icon><n-icon :component="InfoOutlined" /></template>
                {{ t('mailDetails') }}
              </n-button>
            </div>
          </n-popover>

          <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="handleDelete">
            <template #trigger>
              <n-button size="small" quaternary type="error" :title="t('delete')" :aria-label="t('delete')">
                <template #icon><n-icon :component="DeleteOutlineRound" /></template>
                {{ t('delete') }}
              </n-button>
            </template>
            {{ t('deleteMailTip') }}
          </n-popconfirm>
        </div>
      </div>
    </div>

    <!-- Remote images blocked banner -->
    <n-alert v-if="processedMail.blocked" type="warning" :show-icon="false" :bordered="false"
      class="remote-images-banner">
      <div class="remote-images-inner">
        <span>{{ t('remoteImagesBlocked', { count: processedMail.blocked }) }}</span>
        <n-button size="tiny" secondary type="warning" @click="handleLoadRemoteImages">
          <template #icon>
            <n-icon :component="ImageRound" />
          </template>
          {{ t('loadRemoteImages') }}
        </n-button>
      </div>
    </n-alert>

    <!-- AI / Smart OTP Extract Card -->
    <AiExtractInfo :metadata="mail.metadata" :subject="mail.subject" :text="mail.text" />

    <!-- Email Body -->
    <div class="mail-content" :class="{ 'dark-mode': isDark }">
      <pre v-if="showTextMail" class="mail-text">{{ mail.text }}</pre>
      <iframe v-else-if="useIframeShowMail" :srcdoc="processedMail.message" class="mail-iframe" sandbox="allow-same-origin allow-popups">
      </iframe>
      <ShadowHtmlComponent v-else :key="mail.id" :htmlContent="shadowMailHtml" :isDark="isDark" class="mail-html" />
    </div>
  </div>

  <!-- Mail Details Modal -->
  <n-modal v-model:show="showMailDetails" preset="card" :title="t('mailDetails')" :bordered="false"
    class="mail-details-modal" style="width: min(480px, calc(100vw - 24px));">
    <n-descriptions :column="1" label-placement="left" :content-style="{ overflowWrap: 'anywhere' }">
      <n-descriptions-item v-if="mail.subject" label="Subject">{{ mail.subject }}</n-descriptions-item>
      <n-descriptions-item label="From">{{ mail.source }}</n-descriptions-item>
      <n-descriptions-item v-if="mail.originalSource && mail.originalSource !== mail.source"
        label="SMTP envelope sender">{{ mail.originalSource }}</n-descriptions-item>
      <n-descriptions-item v-if="showEMailTo" label="To">{{ mail.address }}</n-descriptions-item>
      <n-descriptions-item label="Received at">{{ utcToLocalDate(mail.created_at, useUTCDate) }}</n-descriptions-item>
      <n-descriptions-item v-if="enableMailReadStatus && (mail.is_unread === 0 || mail.is_unread === 1)"
        label="Status">{{ mail.is_unread === 1 ? 'Unread' : 'Read' }}</n-descriptions-item>
      <n-descriptions-item v-if="mail.attachments?.length" :label="`Attachments (${mail.attachments.length})`">
        <n-space vertical :size="4">
          <span v-for="attachment in mail.attachments" :key="attachment.id">
            {{ attachment.filename || '—' }} · {{ attachment.size }}
          </span>
        </n-space>
      </n-descriptions-item>
      <n-descriptions-item v-if="mail.message_id" label="Message-ID">{{ mail.message_id }}</n-descriptions-item>
      <n-descriptions-item label="ID">{{ mail.id }}</n-descriptions-item>
    </n-descriptions>
  </n-modal>

  <!-- Fullscreen Drawer -->
  <n-drawer v-model:show="showFullscreen" width="100%" placement="bottom" :trap-focus="false" :block-scroll="true"
    style="height: 100dvh;">
    <n-drawer-content :title="mail.subject" closable>
      <div class="fullscreen-mail-content" :class="{ 'dark-mode': isDark }">
        <pre v-if="showTextMail" class="mail-text">{{ mail.text }}</pre>
        <iframe v-else-if="useIframeShowMail" :srcdoc="processedMail.message" class="mail-iframe" sandbox="allow-same-origin allow-popups">
        </iframe>
        <ShadowHtmlComponent v-else :key="mail.id" :htmlContent="shadowMailHtml" :isDark="isDark" class="mail-html" />
      </div>
    </n-drawer-content>
  </n-drawer>

  <!-- Attachments Modal -->
  <n-modal v-model:show="showAttachments" preset="card" :title="t('attachments')" style="width: min(460px, calc(100vw - 24px));">
    <n-spin v-model:show="attachmentLoding">
      <n-list hoverable clickable>
        <n-list-item v-for="row in curAttachments" v-bind:key="row.id">
          <n-thing :title="row.filename">
            <template #description>
              <n-space align="center">
                <n-tag size="small" :bordered="false" type="info">
                  {{ row.size }}
                </n-tag>
                <n-button v-if="showSaveS3" @click="handleSaveToS3(row.filename, row.blob)" secondary type="info"
                  size="tiny">
                  {{ t('saveToS3') }}
                </n-button>
              </n-space>
            </template>
          </n-thing>
          <template #suffix>
            <n-button tag="a" target="_blank" secondary type="primary" size="small" :download="row.filename"
              :href="row.url">
              <template #icon><n-icon :component="CloudDownloadRound" /></template>
            </n-button>
          </template>
        </n-list-item>
      </n-list>
    </n-spin>
  </n-modal>
</template>

<style scoped>
.mail-content-renderer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.mail-header-meta {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--app-border);
}

.sender-row {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.reader-avatar {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--app-accent-soft);
  color: var(--app-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
}

.sender-info {
  flex: 1;
  min-width: 0;
}

.sender-address {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  overflow-wrap: anywhere;
  line-height: 1.35;
}

.sender-sub {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 3px;
  font-size: 12px;
  color: var(--app-text-muted);
}

.recipient-chip {
  overflow-wrap: anywhere;
}

.mail-actions-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
}

.mail-primary-actions,
.mail-secondary-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.mail-secondary-actions {
  margin-left: auto;
}

.mail-more-actions {
  width: 210px;
  max-width: calc(100vw - 40px);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mail-more-actions :deep(.n-button) {
  justify-content: flex-start;
  height: auto;
  min-height: 34px;
  padding: 6px 10px;
}

.mail-more-actions :deep(.n-button__content) {
  white-space: normal;
  text-align: left;
}

.remote-images-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  font-size: 13px;
}

.mail-content {
  margin-top: 2px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 10px;
}

.mail-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  margin: 0;
  padding: 4px 0;
  font-family: inherit;
  font-size: 14.5px;
  line-height: 1.68;
  color: var(--app-text);
}

.mail-iframe {
  width: 100%;
  height: 100%;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  min-height: 420px;
  background: #ffffff;
}

.mail-html {
  width: 100%;
  height: 100%;
}

.fullscreen-mail-content {
  height: calc(100dvh - 88px);
  overflow: auto;
}

.fullscreen-mail-content .mail-iframe {
  min-height: calc(100dvh - 100px);
}
</style>

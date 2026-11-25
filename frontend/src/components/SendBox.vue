<script setup>
import { watch, onMounted, ref, computed } from "vue";
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import { useIsMobile } from '../utils/composables'
import { utcToLocalDate } from '../utils';
import {
  SendOutlined, RefreshRound, ChecklistRtlRound, CloseRound,
  DeleteOutlineRound, CodeRound, ArrowBackIosNewFilled
} from '@vicons/material'

const message = useMessage()
const isMobile = useIsMobile()

const props = defineProps({
  enableUserDeleteEmail: {
    type: Boolean,
    default: false,
    required: false
  },
  showEMailFrom: {
    type: Boolean,
    default: false
  },
  fetchMailData: {
    type: Function,
    default: () => { },
    required: true
  },
  deleteMail: {
    type: Function,
    default: () => { },
    required: false
  },
})

const { mailboxSplitSize, loading, useUTCDate } = useGlobalState()
const data = ref([])

const count = ref(0)
const page = ref(1)
const pageSize = ref(20)

const curMail = ref(null);
const mobileReaderVisible = computed({
  get: () => Boolean(curMail.value),
  set: (v) => { if (!v) curMail.value = null; }
});
const showCode = ref(false)

const multiActionMode = ref(false)
const showMultiActionDelete = ref(false)
const multiActionDeleteProgress = ref({ percentage: 0, tip: '0/0' })

const { t } = useScopedI18n('components.SendBox')

watch([page, pageSize], async ([p, ps], [oldPage, oldPageSize]) => {
  if (p !== oldPage || ps !== oldPageSize) {
    await refresh();
  }
})

const refresh = async () => {
  try {
    const { results, count: totalCount } = await props.fetchMailData(
      pageSize.value, (page.value - 1) * pageSize.value
    );
    data.value = results.map((item) => {
      try {
        const parsed = JSON.parse(item.raw);
        if (parsed.version == "v2") {
          item.to_mail = parsed.to_name ? `${parsed.to_name} <${parsed.to_mail}>` : parsed.to_mail;
          item.subject = parsed.subject;
          item.is_html = parsed.is_html;
          item.content = parsed.content;
          item.raw = JSON.stringify(parsed, null, 2);
        } else {
          item.to_mail = parsed?.personalizations?.map(
            (p) => p.to?.map((toItem) => toItem.email).join(',')
          ).join(';');
          item.subject = parsed.subject;
          item.is_html = (parsed.content[0]?.type != 'text/plain');
          item.content = parsed.content[0]?.value;
          item.raw = JSON.stringify(parsed, null, 2);
        }
      } catch (error) {
        console.log(error);
      }
      return item;
    });
    if (totalCount > 0) {
      count.value = totalCount;
    }
    if (!isMobile.value && !curMail.value && data.value.length > 0) {
      curMail.value = data.value[0];
    }
  } catch (error) {
    message.error(error.message || "error");
    console.error(error);
  }
};

const clickRow = async (row) => {
  if (multiActionMode.value) {
    row.checked = !row.checked;
    return;
  }
  curMail.value = row;
};

const isSelected = (row) => Boolean(curMail.value && row.id == curMail.value.id);

const onSpiltSizeChange = (size) => {
  mailboxSplitSize.value = size;
}

const deleteMail = async () => {
  try {
    await props.deleteMail(curMail.value.id);
    message.success(t("success"));
    curMail.value = null;
    await refresh();
  } catch (error) {
    message.error(error.message || "error");
  }
};

const showMultiActionMode = computed(() => props.enableUserDeleteEmail);

const multiActionModeClick = (enableMulti) => {
  data.value.forEach((item) => { item.checked = false; });
  multiActionMode.value = enableMulti;
}

const multiActionSelectAll = (checked) => {
  data.value.forEach((item) => { item.checked = checked; });
}

const multiActionDeleteMail = async () => {
  try {
    loading.value = true;
    const selectedMails = data.value.filter((item) => item.checked);
    if (selectedMails.length === 0) {
      message.error(t('pleaseSelectMail'));
      return;
    }
    multiActionDeleteProgress.value = {
      percentage: 0,
      tip: `0/${selectedMails.length}`
    };
    for (const [index, mail] of selectedMails.entries()) {
      await props.deleteMail(mail.id);
      showMultiActionDelete.value = true;
      multiActionDeleteProgress.value = {
        percentage: Math.floor((index + 1) / selectedMails.length * 100),
        tip: `${index + 1}/${selectedMails.length}`
      };
    }
    message.success(t("success"));
    multiActionMode.value = false;
    await refresh();
  } catch (error) {
    message.error(error.message || "error");
  } finally {
    loading.value = false;
    showMultiActionDelete.value = true;
  }
}

onMounted(async () => {
  await refresh();
});
</script>

<template>
  <div class="sendbox-root">
    <!-- Desktop -->
    <div v-if="!isMobile" class="sendbox-desktop app-surface-card">
      <div class="sendbox-toolbar">
        <template v-if="multiActionMode">
          <div class="toolbar-group">
            <n-button @click="multiActionModeClick(false)" size="small" quaternary>
              <template #icon><n-icon :component="CloseRound" /></template>
              {{ t('cancelMultiAction') }}
            </n-button>
            <n-button @click="multiActionSelectAll(true)" size="small" secondary>
              {{ t('selectAll') }}
            </n-button>
            <n-button @click="multiActionSelectAll(false)" size="small" quaternary>
              {{ t('unselectAll') }}
            </n-button>
            <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="multiActionDeleteMail">
              <template #trigger>
                <n-button size="small" secondary type="error">
                  <template #icon><n-icon :component="DeleteOutlineRound" /></template>
                  {{ t('delete') }}
                </n-button>
              </template>
              {{ t('deleteMailTip') }}
            </n-popconfirm>
          </div>
        </template>
        <template v-else>
          <div class="toolbar-group">
            <n-button @click="refresh" size="small" type="primary" secondary>
              <template #icon><n-icon :component="RefreshRound" /></template>
              {{ t('refresh') }}
            </n-button>
            <n-button v-if="showMultiActionMode" @click="multiActionModeClick(true)" size="small" quaternary>
              <template #icon><n-icon :component="ChecklistRtlRound" /></template>
              {{ t('multiAction') }}
            </n-button>
          </div>
          <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count"
            :page-sizes="[20, 50, 100]" size="small" show-size-picker />
        </template>
      </div>

      <n-split class="sendbox-split" direction="horizontal" :max="0.65" :min="0.18" :resize-trigger-size="6"
        :default-size="mailboxSplitSize < 0.18 ? 0.3 : mailboxSplitSize" :on-update:size="onSpiltSizeChange">
        <template #resize-trigger>
          <div class="split-handle"><div class="split-handle__grip" /></div>
        </template>
        <template #1>
          <div class="list-pane">
            <div v-if="data.length === 0" class="empty-state">
              <div class="empty-icon"><n-icon :component="SendOutlined" :size="26" /></div>
              <p>{{ t('emptySent') }}</p>
            </div>
            <div v-else class="sent-list">
              <div v-for="row in data" :key="row.id" class="sent-row" :class="{ 'is-selected': isSelected(row) }"
                @click="() => clickRow(row)">
                <n-checkbox v-if="multiActionMode" v-model:checked="row.checked" @click.stop class="row-check" />
                <div class="sent-row-body">
                  <div class="sent-row-top">
                    <span class="sent-to">{{ row.to_mail || '—' }}</span>
                    <span class="sent-date">{{ utcToLocalDate(row.created_at, useUTCDate) }}</span>
                  </div>
                  <div v-if="showEMailFrom" class="sent-from">{{ row.address }}</div>
                  <div class="sent-subject">{{ row.subject || '—' }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>
        <template #2>
          <div class="reader-pane">
            <div v-if="curMail" class="reader-inner">
              <h2 class="reader-subject">{{ curMail.subject || '—' }}</h2>
              <div class="reader-meta">
                <div><strong>FROM:</strong> {{ curMail.address }}</div>
                <div><strong>TO:</strong> {{ curMail.to_mail }}</div>
                <div class="meta-time">{{ utcToLocalDate(curMail.created_at, useUTCDate) }} · #{{ curMail.id }}</div>
              </div>
              <div class="reader-actions">
                <n-button size="small" secondary @click="showCode = !showCode">
                  <template #icon><n-icon :component="CodeRound" /></template>
                  {{ t('showCode') }}
                </n-button>
                <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="deleteMail">
                  <template #trigger>
                    <n-button quaternary type="error" size="small">
                      <template #icon><n-icon :component="DeleteOutlineRound" /></template>
                      {{ t('delete') }}
                    </n-button>
                  </template>
                  {{ t('deleteMailTip') }}
                </n-popconfirm>
              </div>
              <div class="reader-content">
                <pre v-if="showCode">{{ curMail.raw }}</pre>
                <pre v-else-if="!curMail.is_html">{{ curMail.content }}</pre>
                <div v-else v-html="curMail.content"></div>
              </div>
            </div>
            <div v-else class="empty-state">
              <div class="empty-icon large"><n-icon :component="SendOutlined" :size="32" /></div>
              <p>{{ count === 0 ? t('emptySent') : t('pleaseSelectMail') }}</p>
            </div>
          </div>
        </template>
      </n-split>
    </div>

    <!-- Mobile -->
    <div v-else class="sendbox-mobile">
      <div class="mobile-bar">
        <n-button @click="refresh" size="small" type="primary" secondary>
          <template #icon><n-icon :component="RefreshRound" /></template>
          {{ t('refresh') }}
        </n-button>
        <n-pagination v-if="count > pageSize" v-model:page="page" v-model:page-size="pageSize" :item-count="count" simple size="small" />
      </div>

      <div class="app-surface-card mobile-list-wrap">
        <div v-if="data.length === 0" class="empty-state">
          <div class="empty-icon"><n-icon :component="SendOutlined" :size="26" /></div>
          <p>{{ t('emptySent') }}</p>
        </div>
        <div v-else class="sent-list">
          <div v-for="row in data" :key="row.id" class="sent-row" @click="() => clickRow(row)">
            <div class="sent-row-body">
              <div class="sent-row-top">
                <span class="sent-to">{{ row.to_mail || '—' }}</span>
                <span class="sent-date">{{ utcToLocalDate(row.created_at, useUTCDate) }}</span>
              </div>
              <div v-if="showEMailFrom" class="sent-from">{{ row.address }}</div>
              <div class="sent-subject">{{ row.subject || '—' }}</div>
            </div>
          </div>
        </div>
      </div>

      <n-drawer v-model:show="mobileReaderVisible" width="100%" placement="right" :trap-focus="false" :block-scroll="true">
        <div v-if="curMail" class="mobile-reader-shell">
          <div class="mobile-reader-topbar">
            <button type="button" class="mobile-back-btn" @click="curMail = null">
              <n-icon :component="ArrowBackIosNewFilled" :size="17" />
              <span>{{ t('back') || 'Back' }}</span>
            </button>
            <div class="reader-actions compact">
              <n-button size="tiny" secondary @click="showCode = !showCode">
                <template #icon><n-icon :component="CodeRound" /></template>
              </n-button>
              <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="deleteMail">
                <template #trigger>
                  <n-button quaternary type="error" size="tiny">
                    <template #icon><n-icon :component="DeleteOutlineRound" /></template>
                  </n-button>
                </template>
                {{ t('deleteMailTip') }}
              </n-popconfirm>
            </div>
          </div>
          <div class="mobile-reader-scroll">
            <h2 class="reader-subject">{{ curMail.subject || '—' }}</h2>
            <div class="reader-meta">
              <div><strong>FROM:</strong> {{ curMail.address }}</div>
              <div><strong>TO:</strong> {{ curMail.to_mail }}</div>
              <div class="meta-time">{{ utcToLocalDate(curMail.created_at, useUTCDate) }} · #{{ curMail.id }}</div>
            </div>
            <div class="reader-content">
              <pre v-if="showCode">{{ curMail.raw }}</pre>
              <pre v-else-if="!curMail.is_html">{{ curMail.content }}</pre>
              <div v-else v-html="curMail.content"></div>
            </div>
          </div>
        </div>
      </n-drawer>
    </div>

    <n-modal v-model:show="showMultiActionDelete" preset="dialog" :title="t('delete') + t('success')" negative-text="OK">
      <n-space justify="center">
        <n-progress type="circle" status="error" :percentage="multiActionDeleteProgress.percentage">
          <span style="text-align: center">{{ multiActionDeleteProgress.tip }}</span>
        </n-progress>
      </n-space>
    </n-modal>
  </div>
</template>

<style scoped>
.sendbox-root {
  text-align: left;
}

.sendbox-desktop {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.sendbox-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sendbox-split {
  height: min(72vh, 740px);
  min-height: 480px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.sendbox-split :deep(.n-split-pane-1),
.sendbox-split :deep(.n-split-pane-2) {
  min-width: 0;
  overflow: hidden;
}

.list-pane,
.reader-pane {
  height: 100%;
  overflow-y: auto;
  background: var(--app-surface);
}

.sent-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 15px;
  border-bottom: 1px solid var(--app-border);
  cursor: pointer;
  transition: background-color 0.14s var(--app-ease);
}

.sent-row:last-child {
  border-bottom: 0;
}

.sent-row:hover {
  background: var(--app-surface-subtle);
}

.sent-row.is-selected {
  background: var(--app-accent-soft);
}

.sent-row.is-selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--app-accent);
}

.row-check {
  margin-top: 3px;
}

.sent-row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sent-row-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.sent-to {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sent-date {
  font-size: 11.5px;
  color: var(--app-text-muted);
  flex-shrink: 0;
}

.sent-from {
  font-size: 12px;
  color: var(--app-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sent-subject {
  font-size: 13.5px;
  color: var(--app-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-inner {
  padding: 20px 24px;
}

.reader-subject {
  margin: 0 0 12px;
  font-size: 19px;
  font-weight: 700;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.reader-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--app-surface-subtle);
  font-size: 13px;
  color: var(--app-text-secondary);
  overflow-wrap: anywhere;
  margin-bottom: 12px;
}

.meta-time {
  font-size: 12px;
  color: var(--app-text-muted);
}

.reader-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.reader-actions.compact {
  margin-bottom: 0;
}

.reader-content {
  font-size: 14px;
  line-height: 1.65;
  overflow-x: auto;
}

pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: inherit;
  margin: 0;
}

.empty-state {
  min-height: 240px;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--app-text-muted);
  padding: 24px;
}

.empty-icon {
  width: 52px;
  height: 52px;
  border-radius: 15px;
  background: var(--app-surface-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
}

.empty-icon.large {
  width: 64px;
  height: 64px;
  border-radius: 18px;
}

.split-handle {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--app-border);
}

.split-handle__grip {
  width: 2px;
  height: 28px;
  border-radius: 2px;
  background: var(--app-text-muted);
  opacity: 0.35;
}

.sendbox-mobile {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mobile-list-wrap {
  overflow: hidden;
}

.mobile-reader-shell {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--app-surface);
}

.mobile-reader-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 12px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-glass-strong);
}

.mobile-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--app-accent);
  font-size: 15px;
  font-weight: 600;
  padding: 6px 8px;
  cursor: pointer;
}

.mobile-reader-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
</style>

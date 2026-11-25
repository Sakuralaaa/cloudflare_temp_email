<script setup>
import { watch, onMounted, ref, onBeforeUnmount, computed } from "vue";
import { useMessage } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import { useGlobalState } from '../store'
import {
  CloudDownloadRound, ArrowBackIosNewFilled, ArrowForwardIosFilled,
  InboxOutlined, RefreshRound, SearchRound, ChecklistRtlRound,
  AutorenewRound, DeleteOutlineRound, CloseRound, DoneAllRound
} from '@vicons/material'
import { useIsMobile } from '../utils/composables'
import { processItem } from '../utils/email-parser'
import { buildReplyModel, buildForwardModel } from '../utils/mail-actions'
import MailContentRenderer from "./MailContentRenderer.vue";
import MailSummary from "./MailSummary.vue";

const message = useMessage()
const isMobile = useIsMobile()

const props = defineProps({
  enableUserDeleteEmail: {
    type: Boolean,
    default: false,
    required: false
  },
  showEMailTo: {
    type: Boolean,
    default: true,
    required: false
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
  showReply: {
    type: Boolean,
    default: false,
    required: false
  },
  showSaveS3: {
    type: Boolean,
    default: false,
    required: false
  },
  saveToS3: {
    type: Function,
    default: (mail_id, filename, blob) => { },
    required: false
  },
  showFilterInput: {
    type: Boolean,
    default: false,
    required: false
  },
  enableMailReadStatus: {
    type: Boolean,
    default: false
  },
  updateMailReadStatus: {
    type: Function,
    default: () => { }
  },
  onReplyMail: {
    type: Function,
    default: null
  },
  onForwardMail: {
    type: Function,
    default: null
  },
})

const localFilterKeyword = ref('')

const {
  isDark, mailboxSplitSize, mailListView, mailListPreviewLineClamp, indexTab, loading,
  autoRefresh, configAutoRefreshInterval, sendMailModel
} = useGlobalState()
const autoRefreshInterval = ref(configAutoRefreshInterval.value)
const rawData = ref([])
const timer = ref(null)

const count = ref(0)
const page = ref(1)
const pageSize = ref(20)
const isRefreshing = ref(false)

const mailListPreviewLineClampValue = computed(() => {
  const value = Number(mailListPreviewLineClamp.value)
  if (!Number.isFinite(value)) return 0
  return Math.min(5, Math.max(0, Math.round(value)))
})

const data = computed(() => {
  if (!localFilterKeyword.value || localFilterKeyword.value.trim() === '') {
    return rawData.value;
  }
  const keyword = localFilterKeyword.value.toLowerCase();
  return rawData.value.filter(mail => {
    const searchFields = [
      mail.subject || '',
      mail.text || '',
      mail.source || '',
      mail.message || ''
    ].map(field => field.toLowerCase());
    return searchFields.some(field => field.includes(keyword));
  });
})

const selectedCount = computed(() => data.value.filter(m => m.checked).length)

const openMail = (mail) => {
  curMail.value = mail
  if (mail?.is_unread !== 1 || !props.enableMailReadStatus) return
  mail.is_unread = 0
  void props.updateMailReadStatus(mail.id, false).catch(() => {
    mail.is_unread = 1
  })
}

const toggleCurrentMailUnread = async () => {
  if (!curMail.value || !props.enableMailReadStatus) return
  const mail = curMail.value
  const previousValue = mail.is_unread
  const isUnread = previousValue !== 1
  mail.is_unread = isUnread ? 1 : 0
  try {
    await props.updateMailReadStatus(mail.id, isUnread)
    message.success(t("success"))
  } catch {
    mail.is_unread = previousValue
  }
}

const canGoPrevMail = computed(() => {
  if (!curMail.value) return false
  const currentIndex = data.value.findIndex(mail => mail.id === curMail.value.id)
  return currentIndex > 0 || page.value > 1
})

const canGoNextMail = computed(() => {
  if (!curMail.value) return false
  const currentIndex = data.value.findIndex(mail => mail.id === curMail.value.id)
  return currentIndex < data.value.length - 1 || count.value > page.value * pageSize.value
})

const prevMail = async () => {
  if (!canGoPrevMail.value) return
  const currentIndex = data.value.findIndex(mail => mail.id === curMail.value.id)

  if (currentIndex > 0) {
    openMail(data.value[currentIndex - 1])
  } else if (page.value > 1) {
    page.value--
    const refreshed = await refresh()
    if (refreshed && data.value.length > 0) {
      openMail(data.value[data.value.length - 1])
    }
  }
}

const nextMail = async () => {
  if (!canGoNextMail.value) return
  const currentIndex = data.value.findIndex(mail => mail.id === curMail.value.id)

  if (currentIndex < data.value.length - 1) {
    openMail(data.value[currentIndex + 1])
  } else if (count.value > page.value * pageSize.value) {
    page.value++
    const refreshed = await refresh()
    if (refreshed && data.value.length > 0) {
      openMail(data.value[0])
    }
  }
}

const curMail = ref(null);
const mobileReaderVisible = computed({
  get: () => Boolean(curMail.value),
  set: (val) => {
    if (!val) curMail.value = null;
  }
});

const multiActionMode = ref(false)
const showMultiActionDownload = ref(false)
const showMultiActionDelete = ref(false)
const multiActionDownloadZip = ref({})
const multiActionDeleteProgress = ref({ percentage: 0, tip: '0/0' })

const { t } = useScopedI18n('components.MailBox')

const setupAutoRefresh = async (enabled) => {
  autoRefreshInterval.value = configAutoRefreshInterval.value;
  if (enabled) {
    clearInterval(timer.value);
    timer.value = setInterval(async () => {
      if (loading.value) return;
      autoRefreshInterval.value--;
      if (autoRefreshInterval.value <= 0) {
        autoRefreshInterval.value = configAutoRefreshInterval.value;
        await backFirstPageAndRefresh();
      }
    }, 1000)
  } else {
    clearInterval(timer.value)
    timer.value = null
  }
}

watch(autoRefresh, async (val) => {
  setupAutoRefresh(val)
}, { immediate: true })

let loadedPage = { page: page.value, pageSize: pageSize.value }
let requestedPage = null
watch([page, pageSize], async ([p, ps]) => {
  if (requestedPage?.page === p && requestedPage.pageSize === ps) return
  if (loadedPage.page !== p || loadedPage.pageSize !== ps) {
    await refresh();
  }
})

const refresh = async () => {
  const targetPage = page.value
  const targetPageSize = pageSize.value
  requestedPage = { page: targetPage, pageSize: targetPageSize }
  isRefreshing.value = true
  try {
    const { results, count: totalCount } = await props.fetchMailData(
      targetPageSize, (targetPage - 1) * targetPageSize
    );
    loading.value = true;
    rawData.value = await Promise.all(results.map(async (item) => {
      item.checked = false;
      return await processItem(item);
    }));
    if (totalCount >= 0) {
      count.value = totalCount;
    }
    loadedPage = { page: targetPage, pageSize: targetPageSize }
    if (!isMobile.value && !mailListView.value && !curMail.value && data.value.length > 0) {
      openMail(data.value[0]);
    }
    return true
  } catch (error) {
    page.value = loadedPage.page
    pageSize.value = loadedPage.pageSize
    message.error(error.message || "error");
    console.error(error);
    return false
  } finally {
    requestedPage = null
    loading.value = false;
    isRefreshing.value = false;
  }
};

const backFirstPageAndRefresh = async () => {
  page.value = 1;
  await refresh();
}

const clickRow = async (row) => {
  if (multiActionMode.value) {
    row.checked = !row.checked;
    return;
  }
  openMail(row);
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

const replyMail = async () => {
  const model = buildReplyModel(curMail.value, t);
  if (props.onReplyMail) {
    props.onReplyMail(curMail.value, model);
    return;
  }
  sendMailModel.value = model;
  indexTab.value = 'sendmail';
};

const forwardMail = async () => {
  const model = buildForwardModel(curMail.value, t);
  if (props.onForwardMail) {
    props.onForwardMail(curMail.value, model);
    return;
  }
  sendMailModel.value = model;
  indexTab.value = 'sendmail';
};

const saveToS3Proxy = async (filename, blob) => {
  await props.saveToS3(curMail.value.id, filename, blob);
}

const multiActionModeClick = (enableMulti) => {
  if (enableMulti) {
    data.value.forEach((item) => { item.checked = false; });
    multiActionMode.value = true;
  } else {
    multiActionMode.value = false;
    data.value.forEach((item) => { item.checked = false; });
  }
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

const multiActionDownload = async () => {
  try {
    loading.value = true;
    const selectedMails = data.value.filter((item) => item.checked);
    if (selectedMails.length === 0) {
      message.error(t('pleaseSelectMail'));
      return;
    }
    const JSZipModlue = await import('jszip');
    const JSZip = JSZipModlue.default;
    const zip = new JSZip();
    for (const mail of selectedMails) {
      zip.file(`${mail.id}.eml`, mail.raw);
    }
    multiActionDownloadZip.value = {
      url: URL.createObjectURL(await zip.generateAsync({ type: "blob" })),
      filename: `mails-${new Date().toISOString().replace(/:/g, '-')}.zip`
    }
    showMultiActionDownload.value = true;
  } catch (error) {
    message.error(error.message || "error");
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await refresh();
});

onBeforeUnmount(() => {
  clearInterval(timer.value)
})
</script>

<template>
  <div class="mailbox-root">
    <!-- ==================== DESKTOP WORKSPACE ==================== -->
    <div v-if="!isMobile" class="mailbox-desktop app-surface-card">
      <!-- Integrated Toolbar -->
      <div class="mailbox-toolbar">
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
            <span v-if="selectedCount > 0" class="selected-badge">{{ selectedCount }}</span>
          </div>
          <div class="toolbar-group">
            <n-button @click="multiActionDownload" size="small" secondary type="primary">
              <template #icon><n-icon :component="CloudDownloadRound" /></template>
              {{ t('downloadMail') }}
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
          <div class="toolbar-group toolbar-left">
            <n-button @click="backFirstPageAndRefresh" size="small" type="primary" secondary :loading="isRefreshing">
              <template #icon><n-icon :component="RefreshRound" /></template>
              {{ t('refresh') }}
            </n-button>

            <button
              type="button"
              class="auto-refresh-pill"
              :class="{ 'is-on': autoRefresh }"
              @click="autoRefresh = !autoRefresh"
              :title="t('autoRefresh')"
            >
              <n-icon :component="AutorenewRound" :size="15" :class="{ 'spin-slow': autoRefresh }" />
              <span>{{ autoRefresh ? t('refreshAfter', { msg: autoRefreshInterval }) : t('autoRefresh') }}</span>
            </button>

            <n-button @click="multiActionModeClick(true)" size="small" quaternary>
              <template #icon><n-icon :component="ChecklistRtlRound" /></template>
              {{ t('multiAction') }}
            </n-button>

            <n-input
              v-if="showFilterInput"
              v-model:value="localFilterKeyword"
              :placeholder="t('keywordQueryTip')"
              size="small"
              clearable
              class="desktop-search-input"
            >
              <template #prefix>
                <n-icon :component="SearchRound" />
              </template>
            </n-input>
          </div>

          <div class="toolbar-group toolbar-right">
            <n-pagination
              v-model:page="page"
              v-model:page-size="pageSize"
              :item-count="count"
              :page-sizes="[20, 50, 100]"
              size="small"
              show-size-picker
            />
          </div>
        </template>
      </div>

      <!-- Split View or Full List -->
      <n-split
        v-if="!mailListView || curMail"
        class="mailbox-split"
        direction="horizontal"
        :max="0.65"
        :min="0.18"
        :resize-trigger-size="6"
        :default-size="mailboxSplitSize < 0.18 ? 0.3 : mailboxSplitSize"
        :on-update:size="onSpiltSizeChange"
      >
        <template #resize-trigger>
          <div class="split-handle">
            <div class="split-handle__grip" />
          </div>
        </template>

        <template #1>
          <div class="mail-list-pane">
            <div v-if="data.length === 0" class="empty-list-state">
              <div class="empty-icon-circle">
                <n-icon :component="InboxOutlined" :size="28" />
              </div>
              <p class="empty-title">{{ t('emptyInbox') }}</p>
            </div>
            <div v-else class="mail-list">
              <div
                v-for="row in data"
                :key="row.id"
                class="mail-row"
                :class="{
                  'is-selected': isSelected(row),
                  'is-unread': enableMailReadStatus && row.is_unread === 1
                }"
                @click="() => clickRow(row)"
              >
                <n-checkbox
                  v-if="multiActionMode"
                  v-model:checked="row.checked"
                  class="mail-row-checkbox"
                  @click.stop
                />
                <MailSummary
                  :mail="row"
                  :showEMailTo="showEMailTo"
                  :enableMailReadStatus="enableMailReadStatus"
                  :previewLineClamp="mailListPreviewLineClampValue"
                />
              </div>
            </div>
          </div>
        </template>

        <template #2>
          <div class="mail-reader-pane">
            <template v-if="curMail">
              <div class="reader-nav-bar">
                <div class="reader-nav-left">
                  <n-button v-if="mailListView" @click="curMail = null" quaternary size="small">
                    <template #icon><n-icon :component="ArrowBackIosNewFilled" /></template>
                    {{ t('backToList') }}
                  </n-button>
                </div>
                <div class="reader-nav-right">
                  <n-button @click="prevMail" :disabled="!canGoPrevMail" quaternary size="small">
                    <template #icon><n-icon :component="ArrowBackIosNewFilled" /></template>
                    {{ t('prevMail') }}
                  </n-button>
                  <n-button @click="nextMail" :disabled="!canGoNextMail" quaternary size="small" icon-placement="right">
                    <template #icon><n-icon :component="ArrowForwardIosFilled" /></template>
                    {{ t('nextMail') }}
                  </n-button>
                </div>
              </div>

              <div class="reader-scroll-body">
                <h2 class="reader-subject">{{ curMail.subject || '—' }}</h2>
                <MailContentRenderer
                  :mail="curMail"
                  :showEMailTo="showEMailTo"
                  :enableUserDeleteEmail="enableUserDeleteEmail"
                  :showReply="showReply"
                  :showSaveS3="showSaveS3"
                  :enableMailReadStatus="enableMailReadStatus"
                  :onUpdateMailReadStatus="toggleCurrentMailUnread"
                  :onDelete="deleteMail"
                  :onReply="replyMail"
                  :onForward="forwardMail"
                  :onSaveToS3="saveToS3Proxy"
                />
              </div>
            </template>

            <div v-else class="reader-empty-state">
              <div class="empty-icon-circle large">
                <n-icon :component="InboxOutlined" :size="36" />
              </div>
              <p class="empty-title">{{ count === 0 ? t('emptyInbox') : t('pleaseSelectMail') }}</p>
            </div>
          </div>
        </template>
      </n-split>

      <div v-else class="mail-list-pane full-height">
        <div v-if="data.length === 0" class="empty-list-state">
          <div class="empty-icon-circle">
            <n-icon :component="InboxOutlined" :size="28" />
          </div>
          <p class="empty-title">{{ t('emptyInbox') }}</p>
        </div>
        <div v-else class="mail-list">
          <div
            v-for="row in data"
            :key="row.id"
            class="mail-row"
            :class="{
              'is-selected': isSelected(row),
              'is-unread': enableMailReadStatus && row.is_unread === 1
            }"
            @click="() => clickRow(row)"
          >
            <n-checkbox
              v-if="multiActionMode"
              v-model:checked="row.checked"
              class="mail-row-checkbox"
              @click.stop
            />
            <MailSummary
              :mail="row"
              :showEMailTo="showEMailTo"
              :enableMailReadStatus="enableMailReadStatus"
              :previewLineClamp="mailListPreviewLineClampValue"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== MOBILE WORKSPACE ==================== -->
    <div v-else class="mailbox-mobile">
      <!-- Compact Search + Quick Controls -->
      <div class="mobile-controls">
        <div v-if="showFilterInput" class="mobile-search-wrap">
          <n-input
            v-model:value="localFilterKeyword"
            :placeholder="t('keywordQueryTip')"
            clearable
            round
            class="mobile-search-input"
          >
            <template #prefix>
              <n-icon :component="SearchRound" />
            </template>
          </n-input>
        </div>

        <!-- Normal Action Row -->
        <div v-if="!multiActionMode" class="mobile-toolbar-row">
          <div class="mobile-toolbar-left">
            <n-button @click="backFirstPageAndRefresh" type="primary" secondary size="small" :loading="isRefreshing">
              <template #icon><n-icon :component="RefreshRound" /></template>
              {{ t('refresh') }}
            </n-button>
            <button
              type="button"
              class="auto-refresh-pill compact"
              :class="{ 'is-on': autoRefresh }"
              @click="autoRefresh = !autoRefresh"
            >
              <n-icon :component="AutorenewRound" :size="14" :class="{ 'spin-slow': autoRefresh }" />
              <span>{{ autoRefresh ? `${autoRefreshInterval}s` : t('autoRefresh') }}</span>
            </button>
          </div>
          <div class="mobile-toolbar-right">
            <n-button @click="multiActionModeClick(true)" quaternary size="small" :title="t('multiAction')">
              <template #icon><n-icon :component="ChecklistRtlRound" /></template>
            </n-button>
            <n-pagination
              v-if="count > pageSize"
              v-model:page="page"
              v-model:page-size="pageSize"
              :item-count="count"
              simple
              size="small"
            />
          </div>
        </div>

        <!-- Mobile Multi-Select Bar -->
        <div v-else class="mobile-multi-bar">
          <div class="mobile-multi-left">
            <n-button @click="multiActionModeClick(false)" quaternary size="small">
              <template #icon><n-icon :component="CloseRound" /></template>
            </n-button>
            <n-button @click="multiActionSelectAll(selectedCount < data.length)" secondary size="small">
              <template #icon><n-icon :component="DoneAllRound" /></template>
              {{ selectedCount < data.length ? t('selectAll') : t('unselectAll') }}
            </n-button>
            <span class="selected-badge">{{ selectedCount }}</span>
          </div>
          <div class="mobile-multi-right">
            <n-button @click="multiActionDownload" secondary type="primary" size="small">
              <template #icon><n-icon :component="CloudDownloadRound" /></template>
            </n-button>
            <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="multiActionDeleteMail">
              <template #trigger>
                <n-button secondary type="error" size="small">
                  <template #icon><n-icon :component="DeleteOutlineRound" /></template>
                </n-button>
              </template>
              {{ t('deleteMailTip') }}
            </n-popconfirm>
          </div>
        </div>
      </div>

      <!-- Mobile Mail List Card -->
      <div class="mobile-list-card app-surface-card">
        <div v-if="data.length === 0" class="empty-list-state">
          <div class="empty-icon-circle">
            <n-icon :component="InboxOutlined" :size="28" />
          </div>
          <p class="empty-title">{{ t('emptyInbox') }}</p>
        </div>

        <div v-else class="mail-list">
          <div
            v-for="row in data"
            :key="row.id"
            class="mail-row mobile-mail-row"
            :class="{ 'is-unread': enableMailReadStatus && row.is_unread === 1 }"
            @click="() => clickRow(row)"
          >
            <n-checkbox
              v-if="multiActionMode"
              v-model:checked="row.checked"
              class="mail-row-checkbox"
              @click.stop
            />
            <MailSummary
              :mail="row"
              :showEMailTo="showEMailTo"
              :enableMailReadStatus="enableMailReadStatus"
              :previewLineClamp="mailListPreviewLineClampValue || 1"
            />
          </div>
        </div>
      </div>

      <!-- Full-Screen Native-Feel Slide-Over Mail Reader -->
      <n-drawer
        v-model:show="mobileReaderVisible"
        width="100%"
        placement="right"
        :trap-focus="false"
        :block-scroll="true"
        class="mobile-reader-drawer"
      >
        <div v-if="curMail" class="mobile-reader-shell">
          <div class="mobile-reader-topbar">
            <button type="button" class="mobile-back-btn" @click="curMail = null">
              <n-icon :component="ArrowBackIosNewFilled" :size="17" />
              <span>{{ t('backToList') }}</span>
            </button>
            <div class="mobile-reader-pager">
              <button type="button" class="pager-icon-btn" :disabled="!canGoPrevMail" @click="prevMail" :aria-label="t('prevMail')">
                <n-icon :component="ArrowBackIosNewFilled" :size="16" />
              </button>
              <button type="button" class="pager-icon-btn" :disabled="!canGoNextMail" @click="nextMail" :aria-label="t('nextMail')">
                <n-icon :component="ArrowForwardIosFilled" :size="16" />
              </button>
            </div>
          </div>

          <div class="mobile-reader-scroll">
            <h1 class="mobile-reader-subject">{{ curMail.subject || '—' }}</h1>
            <MailContentRenderer
              :mail="curMail"
              :showEMailTo="showEMailTo"
              :enableUserDeleteEmail="enableUserDeleteEmail"
              :showReply="showReply"
              :showSaveS3="showSaveS3"
              :enableMailReadStatus="enableMailReadStatus"
              :onUpdateMailReadStatus="toggleCurrentMailUnread"
              :onDelete="deleteMail"
              :onReply="replyMail"
              :onForward="forwardMail"
              :onSaveToS3="saveToS3Proxy"
            />
          </div>
        </div>
      </n-drawer>
    </div>

    <!-- Batch Download Modal -->
    <n-modal v-model:show="showMultiActionDownload" preset="dialog" :title="t('downloadMail')">
      <n-space vertical>
        <n-tag type="info" :bordered="false">
          {{ multiActionDownloadZip.filename }}
        </n-tag>
        <n-button tag="a" target="_blank" type="primary" secondary block :download="multiActionDownloadZip.filename"
          :href="multiActionDownloadZip.url">
          <template #icon><n-icon :component="CloudDownloadRound" /></template>
          {{ t('downloadMail') + " zip" }}
        </n-button>
      </n-space>
    </n-modal>

    <!-- Batch Delete Progress Modal -->
    <n-modal v-model:show="showMultiActionDelete" preset="dialog" :title="t('delete') + t('success')"
      negative-text="OK">
      <n-space justify="center">
        <n-progress type="circle" status="error" :percentage="multiActionDeleteProgress.percentage">
          <span style="text-align: center">
            {{ multiActionDeleteProgress.tip }}
          </span>
        </n-progress>
      </n-space>
    </n-modal>
  </div>
</template>

<style scoped>
.mailbox-root {
  text-align: left;
  min-width: 0;
}

/* Desktop Workspace */
.mailbox-desktop {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.mailbox-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  min-width: 0;
  max-width: 100%;
}

.toolbar-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.desktop-search-input {
  width: 210px;
}

.auto-refresh-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--app-border);
  background: var(--app-surface-subtle);
  color: var(--app-text-secondary);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s var(--app-ease);
  white-space: nowrap;
}

.auto-refresh-pill:hover {
  border-color: var(--app-border-strong);
  color: var(--app-text);
}

.auto-refresh-pill.is-on {
  background: var(--app-accent-soft);
  border-color: var(--app-accent-border);
  color: var(--app-accent);
}

.spin-slow {
  animation: spin-slow 4s linear infinite;
}

@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.selected-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--app-accent-soft);
  color: var(--app-accent);
  font-size: 12px;
  font-weight: 600;
}

.mailbox-split {
  height: min(74vh, 780px);
  min-height: 520px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.mailbox-split :deep(.n-split-pane-1),
.mailbox-split :deep(.n-split-pane-2) {
  min-width: 0;
  overflow: hidden;
}

.mail-list-pane {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--app-surface);
}

.mail-list-pane.full-height {
  min-height: 460px;
  max-height: 75vh;
}

.mail-list {
  display: flex;
  flex-direction: column;
}

.mail-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 15px;
  cursor: pointer;
  border-bottom: 1px solid var(--app-border);
  transition: background-color 0.14s var(--app-ease);
}

.mail-row:last-child {
  border-bottom: 0;
}

.mail-row:hover {
  background: var(--app-surface-subtle);
}

.mail-row.is-selected {
  background: var(--app-accent-soft);
}

.mail-row.is-selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--app-accent);
}

.mail-row-checkbox {
  margin-top: 8px;
  flex-shrink: 0;
}

.mail-reader-pane {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--app-surface);
  min-width: 0;
}

.reader-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.reader-nav-left,
.reader-nav-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.reader-scroll-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px 28px;
  min-width: 0;
}

.reader-subject {
  margin: 0 0 14px;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.015em;
  color: var(--app-text);
  overflow-wrap: anywhere;
}

.empty-list-state,
.reader-empty-state {
  height: 100%;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 20px;
  text-align: center;
  color: var(--app-text-muted);
}

.empty-icon-circle {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--app-surface-subtle);
  color: var(--app-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.empty-icon-circle.large {
  width: 68px;
  height: 68px;
  border-radius: 20px;
}

.empty-title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--app-text-secondary);
}

.split-handle {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--app-border);
  transition: background-color 0.16s;
}

.split-handle:hover {
  background: var(--app-accent-border);
}

.split-handle__grip {
  width: 2px;
  height: 28px;
  border-radius: 2px;
  background: var(--app-text-muted);
  opacity: 0.35;
}

/* Mobile Workspace */
.mailbox-mobile {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mobile-toolbar-row,
.mobile-multi-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.mobile-toolbar-left,
.mobile-toolbar-right,
.mobile-multi-left,
.mobile-multi-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mobile-list-card {
  overflow: hidden;
  min-height: 260px;
}

.mobile-mail-row {
  padding: 14px 14px;
}

.mobile-mail-row:active {
  background: var(--app-surface-subtle);
}

/* Full-screen Mobile Reader */
.mobile-reader-shell {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--app-surface);
  color: var(--app-text);
}

.mobile-reader-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 12px;
  padding-top: env(safe-area-inset-top, 0px);
  border-bottom: 1px solid var(--app-border);
  background: var(--app-glass-strong);
  backdrop-filter: blur(16px);
  flex-shrink: 0;
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
  border-radius: 9px;
  cursor: pointer;
}

.mobile-reader-pager {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pager-icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.pager-icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.mobile-reader-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px 16px calc(24px + env(safe-area-inset-bottom, 0px));
  min-width: 0;
}

.mobile-reader-subject {
  margin: 0 0 14px;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--app-text);
  overflow-wrap: anywhere;
}
</style>

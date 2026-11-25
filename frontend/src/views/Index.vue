<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRoute } from 'vue-router'

import { useGlobalState } from '../store'
import { api } from '../api'
import { useIsMobile } from '../utils/composables'
import {
  FullscreenExitOutlined, InboxOutlined, SendOutlined, CreateOutlined,
  SettingsOutlined, PaletteOutlined, ReplyAllOutlined, WebhookOutlined,
  AttachFileOutlined, InfoOutlined, SwapHorizRound, MoreHorizRound,
  AlternateEmailRound, MailOutlineRound, AddCircleOutlineRound
} from '@vicons/material'

import AddressBar from './index/AddressBar.vue';
import MailBox from '../components/MailBox.vue';
import SendBox from '../components/SendBox.vue';
import AutoReply from './index/AutoReply.vue';
import AccountSettings from './index/AccountSettings.vue';
import Appearance from './common/Appearance.vue';
import Webhook from './index/Webhook.vue';
import Attachment from './index/Attachment.vue';
import About from './common/About.vue';
import SimpleIndex from './index/SimpleIndex.vue';
import AdminAccount from './admin/Account.vue';
import AdminMails from './admin/Mails.vue';
import AdminMailsUnknow from './admin/MailsUnknow.vue';
import AdminSendBox from './admin/SendBox.vue';
import AdminCreateAccount from './admin/CreateAccount.vue';

const {
  loading, settings, openSettings, indexTab,
  globalTabplacement, useSimpleIndex, showAdminPage, isTelegram
} = useGlobalState()
const message = useMessage()
const route = useRoute()
const isMobile = useIsMobile()

const addressBarRef = ref(null)
const showMobileMore = ref(false)
const adminMailSubTab = ref('mails')

const SendMail = defineAsyncComponent(() => {
  loading.value = true;
  return import('./index/SendMail.vue')
    .finally(() => loading.value = false);
});

const AdminSendMail = defineAsyncComponent(() => {
  loading.value = true;
  return import('./admin/SendMail.vue')
    .finally(() => loading.value = false);
});

const { t } = useScopedI18n('views.Index')
const { t: adminT } = useScopedI18n('views.Admin')

// Clean solo-admin workspace on Homepage: zero user/single-mailbox fragmentation!
const isAdminHub = computed(() => showAdminPage.value && !isTelegram.value)

const fetchMailData = async (limit, offset) => {
  if (mailIdQuery.value > 0) {
    const singleMail = await api.fetch(`/api/mail/${mailIdQuery.value}`);
    if (singleMail) return { results: [singleMail], count: 1 };
    return { results: [], count: 0 };
  }
  return await api.fetch(`/api/mails?limit=${limit}&offset=${offset}`);
};

const deleteMail = async (curMailId) => {
  await api.fetch(`/api/mails/${curMailId}`, { method: 'DELETE' });
};

const updateMailReadStatus = async (id, isUnread) => {
  await api.fetch(`/api/mails/${id}/read`, {
    method: 'PATCH',
    body: JSON.stringify({ isUnread }),
    showLoading: false
  })
}

const deleteSenboxMail = async (curMailId) => {
  await api.fetch(`/api/sendbox/${curMailId}`, { method: 'DELETE' });
};

const fetchSenboxData = async (limit, offset) => {
  return await api.fetch(`/api/sendbox?limit=${limit}&offset=${offset}`);
};

const saveToS3 = async (mail_id, filename, blob) => {
  try {
    const { url } = await api.fetch(`/api/attachment/put_url`, {
      method: 'POST',
      body: JSON.stringify({ key: `${mail_id}/${filename}` })
    });
    const formData = new FormData();
    formData.append(filename, blob);
    await fetch(url, {
      method: 'PUT',
      body: formData
    });
    message.success(t('saveToS3Success'));
  } catch (error) {
    console.error(error);
    message.error(error.message || "save to s3 error");
  }
}

const mailBoxKey = ref("")
const mailIdQuery = ref("")
const showMailIdQuery = ref(false)

const queryMail = () => {
  mailBoxKey.value = Date.now();
}

// Regular non-admin user tabs
const userTabItems = computed(() => [
  { name: 'mailbox', label: t('inbox'), icon: InboxOutlined, show: true },
  { name: 'sendbox', label: t('sendbox'), icon: SendOutlined, show: openSettings.value.enableSendMail },
  { name: 'sendmail', label: t('sendmail'), icon: CreateOutlined, show: openSettings.value.enableSendMail },
  { name: 'accountSettings', label: t('mailboxSettings'), icon: SettingsOutlined, show: true },
  { name: 'appearance', label: t('appearance'), icon: PaletteOutlined, show: true },
  { name: 'auto_reply', label: t('auto_reply'), icon: ReplyAllOutlined, show: openSettings.value.enableAutoReply },
  { name: 'webhook', label: t('webhookSettings'), icon: WebhookOutlined, show: openSettings.value.enableWebhook },
  { name: 's3_attachment', label: t('s3Attachment'), icon: AttachFileOutlined, show: openSettings.value.isS3Enabled },
  { name: 'about', label: t('about'), icon: InfoOutlined, show: openSettings.value.enableIndexAbout },
].filter(item => item.show))

// Solo-Admin 4-Tab Unified Workspace (full permissions, zero fragmentation!)
const adminHomeTabItems = computed(() => [
  { name: 'admin_mails', label: adminT('mails'), icon: MailOutlineRound },
  { name: 'admin_accounts', label: adminT('mailbox_list'), icon: AlternateEmailRound },
  { name: 'admin_create', label: adminT('mailbox_create'), icon: AddCircleOutlineRound },
  { name: 'admin_sendmail', label: adminT('sendMail'), icon: CreateOutlined },
])

const mobileMoreItems = computed(() =>
  userTabItems.value.filter(item => !['mailbox', 'sendmail'].includes(item.name))
)

const isMoreTabActive = computed(() =>
  mobileMoreItems.value.some(item => item.name === indexTab.value)
)

const selectMobileTab = (name) => {
  indexTab.value = name
  showMobileMore.value = false
}

const openAddressSwitcher = () => {
  addressBarRef.value?.openAddressManage?.()
}

const handleAdminViewMails = () => {
  adminMailSubTab.value = 'mails'
  indexTab.value = 'admin_mails'
}

const handleAdminViewSendBox = () => {
  adminMailSubTab.value = 'sendBox'
  indexTab.value = 'admin_mails'
}

const handleAdminCompose = () => {
  indexTab.value = 'admin_sendmail'
}

// Keep admin tab strictly within the 4 unified admin tabs (default to All Mails)
watch(isAdminHub, (admin) => {
  if (!admin) return
  const validNames = new Set(adminHomeTabItems.value.map(i => i.name))
  if (!validNames.has(indexTab.value)) {
    indexTab.value = 'admin_mails'
  }
}, { immediate: true })

watch(route, () => {
  if (!route.query.mail_id) {
    showMailIdQuery.value = false;
    mailIdQuery.value = "";
    queryMail();
  }
})

onMounted(() => {
  if (route.query.mail_id) {
    showMailIdQuery.value = true;
    mailIdQuery.value = route.query.mail_id;
    queryMail();
  }
})
</script>

<template>
  <div class="index-page">
    <div v-if="useSimpleIndex && !isAdminHub">
      <SimpleIndex />
    </div>

    <!-- ==================== SOLO-ADMIN UNIFIED WORKSPACE ==================== -->
    <div v-else-if="isAdminHub" class="admin-hub-shell">
      <!-- Desktop Top Horizontal Pill Navigation -->
      <div v-if="!isMobile" class="desktop-tab-strip">
        <div class="pill-tabs-scroll">
          <button
            v-for="item in adminHomeTabItems"
            :key="item.name"
            type="button"
            class="pill-tab"
            :class="{ 'is-active': indexTab === item.name }"
            @click="indexTab = item.name"
          >
            <n-icon :component="item.icon" :size="16" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>

      <!-- Full-Width Workspace Card -->
      <div class="tab-content-area">
        <!-- 1. Mails (Priority Domains + All/Priority/Other + Starred Mailboxes + Unknown + SendBox) -->
        <div v-if="indexTab === 'admin_mails'" class="hub-card app-surface-card">
          <n-tabs v-model:value="adminMailSubTab" type="line" animated class="sub-tabs">
            <n-tab-pane name="mails" :tab="adminT('mails')">
              <AdminMails :onCompose="handleAdminCompose" />
            </n-tab-pane>
            <n-tab-pane name="unknow" :tab="adminT('unknow')">
              <AdminMailsUnknow />
            </n-tab-pane>
            <n-tab-pane name="sendBox" :tab="adminT('sendBox')">
              <AdminSendBox />
            </n-tab-pane>
          </n-tabs>
        </div>

        <!-- 2. All Mailboxes (12,445+ Mailboxes, Full Actions & Direct Mail Jump) -->
        <div v-else-if="indexTab === 'admin_accounts'" class="hub-card app-surface-card">
          <AdminAccount
            :onViewMails="handleAdminViewMails"
            :onViewSendBox="handleAdminViewSendBox"
          />
        </div>

        <!-- 3. Create Mailboxes (Single & Batch, 30 Searchable Domains) -->
        <div v-else-if="indexTab === 'admin_create'" class="hub-card app-surface-card">
          <AdminCreateAccount />
        </div>

        <!-- 4. Admin Send Mail (Unrestricted /admin/send_mail, Reply/Forward auto-filled) -->
        <div v-else-if="indexTab === 'admin_sendmail'" class="hub-card app-surface-card">
          <AdminSendMail />
        </div>
      </div>

      <!-- Mobile Bottom Navigation Bar (4 clean direct tabs) -->
      <nav v-if="isMobile" class="mobile-bottom-nav" aria-label="Admin mailbox navigation">
        <button
          v-for="item in adminHomeTabItems"
          :key="item.name"
          type="button"
          class="bottom-nav-item"
          :class="{ 'is-active': indexTab === item.name }"
          @click="indexTab = item.name"
        >
          <n-icon :component="item.icon" :size="22" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
    </div>

    <!-- ==================== REGULAR GUEST / USER HOMEPAGE ==================== -->
    <div v-else>
      <AddressBar ref="addressBarRef" />

      <template v-if="settings.address">
        <div v-if="!isMobile && globalTabplacement === 'top'" class="desktop-tab-strip">
          <div class="pill-tabs-scroll">
            <button
              v-for="item in userTabItems"
              :key="item.name"
              type="button"
              class="pill-tab"
              :class="{ 'is-active': indexTab === item.name }"
              @click="indexTab = item.name"
            >
              <n-icon :component="item.icon" :size="16" />
              <span>{{ item.label }}</span>
            </button>
          </div>
          <n-button @click="useSimpleIndex = true" quaternary size="small" class="simple-mode-btn">
            <template #icon><n-icon :component="FullscreenExitOutlined" /></template>
            {{ t('enterSimpleMode') }}
          </n-button>
        </div>

        <n-tabs
          v-if="!isMobile && globalTabplacement !== 'top'"
          type="card"
          v-model:value="indexTab"
          :placement="globalTabplacement"
        >
          <template #prefix>
            <n-button @click="useSimpleIndex = true" quaternary size="small">
              <template #icon><n-icon :component="FullscreenExitOutlined" /></template>
              {{ t('enterSimpleMode') }}
            </n-button>
          </template>
          <n-tab-pane name="mailbox" :tab="t('inbox')">
            <div v-if="showMailIdQuery" style="margin-bottom: 10px;">
              <n-input-group>
                <n-input v-model:value="mailIdQuery" />
                <n-button @click="queryMail" type="primary" secondary>{{ t('query') }}</n-button>
              </n-input-group>
            </div>
            <MailBox :key="mailBoxKey" :showEMailTo="false" :showReply="openSettings.enableSendMail" :showSaveS3="openSettings.isS3Enabled"
              :saveToS3="saveToS3" :enableUserDeleteEmail="openSettings.enableUserDeleteEmail"
              :fetchMailData="fetchMailData" :deleteMail="deleteMail" :showFilterInput="true"
              :enableMailReadStatus="openSettings.enableMailReadStatus" :updateMailReadStatus="updateMailReadStatus" />
          </n-tab-pane>
          <n-tab-pane v-if="openSettings.enableSendMail" name="sendbox" :tab="t('sendbox')">
            <SendBox :fetchMailData="fetchSenboxData" :enableUserDeleteEmail="openSettings.enableUserDeleteEmail"
              :deleteMail="deleteSenboxMail" />
          </n-tab-pane>
          <n-tab-pane v-if="openSettings.enableSendMail" name="sendmail" :tab="t('sendmail')">
            <SendMail />
          </n-tab-pane>
          <n-tab-pane name="accountSettings" :tab="t('mailboxSettings')">
            <AccountSettings />
          </n-tab-pane>
          <n-tab-pane name="appearance" :tab="t('appearance')">
            <Appearance :showUseSimpleIndex="true" />
          </n-tab-pane>
          <n-tab-pane v-if="openSettings.enableAutoReply" name="auto_reply" :tab="t('auto_reply')">
            <AutoReply />
          </n-tab-pane>
          <n-tab-pane v-if="openSettings.enableWebhook" name="webhook" :tab="t('webhookSettings')">
            <Webhook />
          </n-tab-pane>
          <n-tab-pane v-if="openSettings.isS3Enabled" name="s3_attachment" :tab="t('s3Attachment')">
            <Attachment />
          </n-tab-pane>
          <n-tab-pane v-if="openSettings.enableIndexAbout" name="about" :tab="t('about')">
            <About />
          </n-tab-pane>
        </n-tabs>

        <div v-else class="tab-content-area">
          <div v-if="isMobile && indexTab !== 'mailbox'" class="mobile-section-banner">
            <span class="mobile-section-title">
              {{ userTabItems.find(i => i.name === indexTab)?.label }}
            </span>
          </div>

          <div v-if="indexTab === 'mailbox'">
            <div v-if="showMailIdQuery" style="margin-bottom: 10px;">
              <n-input-group>
                <n-input v-model:value="mailIdQuery" />
                <n-button @click="queryMail" type="primary" secondary>{{ t('query') }}</n-button>
              </n-input-group>
            </div>
            <MailBox :key="mailBoxKey" :showEMailTo="false" :showReply="openSettings.enableSendMail" :showSaveS3="openSettings.isS3Enabled"
              :saveToS3="saveToS3" :enableUserDeleteEmail="openSettings.enableUserDeleteEmail"
              :fetchMailData="fetchMailData" :deleteMail="deleteMail" :showFilterInput="true"
              :enableMailReadStatus="openSettings.enableMailReadStatus" :updateMailReadStatus="updateMailReadStatus" />
          </div>
          <SendBox v-else-if="indexTab === 'sendbox' && openSettings.enableSendMail"
            :fetchMailData="fetchSenboxData" :enableUserDeleteEmail="openSettings.enableUserDeleteEmail"
            :deleteMail="deleteSenboxMail" />
          <SendMail v-else-if="indexTab === 'sendmail' && openSettings.enableSendMail" />
          <AccountSettings v-else-if="indexTab === 'accountSettings'" />
          <Appearance v-else-if="indexTab === 'appearance'" :showUseSimpleIndex="true" />
          <AutoReply v-else-if="indexTab === 'auto_reply' && openSettings.enableAutoReply" />
          <Webhook v-else-if="indexTab === 'webhook' && openSettings.enableWebhook" />
          <Attachment v-else-if="indexTab === 's3_attachment' && openSettings.isS3Enabled" />
          <About v-else-if="indexTab === 'about' && openSettings.enableIndexAbout" />
        </div>

        <nav v-if="isMobile" class="mobile-bottom-nav" aria-label="Mailbox navigation">
          <button
            type="button"
            class="bottom-nav-item"
            :class="{ 'is-active': indexTab === 'mailbox' }"
            @click="indexTab = 'mailbox'"
          >
            <n-icon :component="InboxOutlined" :size="22" />
            <span>{{ t('inbox') }}</span>
          </button>

          <button
            v-if="openSettings.enableSendMail"
            type="button"
            class="bottom-nav-item"
            :class="{ 'is-active': indexTab === 'sendmail' }"
            @click="indexTab = 'sendmail'"
          >
            <n-icon :component="CreateOutlined" :size="21" />
            <span>{{ t('sendmail') }}</span>
          </button>

          <button
            type="button"
            class="bottom-nav-item"
            @click="openAddressSwitcher"
          >
            <n-icon :component="SwapHorizRound" :size="22" />
            <span>{{ t('mailboxSettings').slice(0, 4) === '邮箱设置' ? '切换邮箱' : 'Accounts' }}</span>
          </button>

          <button
            type="button"
            class="bottom-nav-item"
            :class="{ 'is-active': isMoreTabActive }"
            @click="showMobileMore = true"
          >
            <n-icon :component="MoreHorizRound" :size="22" />
            <span>{{ t('appearance').includes('外观') ? '更多' : 'More' }}</span>
          </button>
        </nav>

        <n-drawer
          v-model:show="showMobileMore"
          placement="bottom"
          :height="Math.min(460, 120 + (mobileMoreItems.length + 1) * 52)"
          class="mobile-more-sheet"
        >
          <n-drawer-content :title="t('mailboxSettings')" closable>
            <div class="more-sheet-grid">
              <button
                v-for="item in mobileMoreItems"
                :key="item.name"
                type="button"
                class="more-sheet-item"
                :class="{ 'is-active': indexTab === item.name }"
                @click="selectMobileTab(item.name)"
              >
                <div class="more-sheet-icon">
                  <n-icon :component="item.icon" :size="20" />
                </div>
                <span class="more-sheet-label">{{ item.label }}</span>
              </button>

              <button
                type="button"
                class="more-sheet-item"
                @click="() => { useSimpleIndex = true; showMobileMore = false; }"
              >
                <div class="more-sheet-icon">
                  <n-icon :component="FullscreenExitOutlined" :size="20" />
                </div>
                <span class="more-sheet-label">{{ t('enterSimpleMode') }}</span>
              </button>
            </div>
          </n-drawer-content>
        </n-drawer>
      </template>
    </div>
  </div>
</template>

<style scoped>
.index-page {
  min-width: 0;
}

.hub-card {
  padding: 16px 20px 22px;
  text-align: left;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.sub-tabs :deep(.n-tabs-nav) {
  margin-bottom: 14px;
}

.desktop-tab-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.pill-tabs-scroll {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  padding: 3px;
  border-radius: 13px;
  background: var(--app-surface-subtle);
  border: 1px solid var(--app-border);
}

.pill-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 13px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13.5px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.16s var(--app-ease);
}

.pill-tab:hover {
  color: var(--app-text);
}

.pill-tab.is-active {
  background: var(--app-surface);
  color: var(--app-text);
  font-weight: 600;
  box-shadow: var(--app-shadow-xs);
}

.simple-mode-btn {
  flex-shrink: 0;
}

.mobile-section-banner {
  display: flex;
  align-items: center;
  padding: 2px 4px 10px;
}

.mobile-section-title {
  font-size: 15px;
  font-weight: 650;
  color: var(--app-text);
}

.mobile-bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 45;
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  height: calc(var(--app-mobile-nav-height) + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--app-glass-strong);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-top: 1px solid var(--app-border);
}

.bottom-nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 0;
  background: transparent;
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 500;
  padding: 6px 4px;
  cursor: pointer;
  transition: color 0.15s var(--app-ease);
}

.bottom-nav-item.is-active {
  color: var(--app-accent);
  font-weight: 600;
}

.more-sheet-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding-bottom: env(safe-area-inset-bottom, 8px);
}

.more-sheet-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 13px;
  border: 1px solid var(--app-border);
  background: var(--app-surface-subtle);
  color: var(--app-text);
  font-size: 13.5px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: all 0.14s var(--app-ease);
}

.more-sheet-item.is-active {
  background: var(--app-accent-soft);
  border-color: var(--app-accent-border);
  color: var(--app-accent);
  font-weight: 600;
}

.more-sheet-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--app-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.more-sheet-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 767px) {
  .hub-card {
    padding: 12px 12px 16px;
  }
}
</style>

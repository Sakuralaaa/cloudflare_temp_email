<script setup>
import { computed, onMounted, ref } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router'
import {
  RocketLaunchOutlined, TuneRound, PeopleOutlineRound,
  SendOutlined, BarChartRound, ConfirmationNumberOutlined,
  BuildOutlined, PaletteOutlined, AdminPanelSettingsOutlined,
  InfoOutlined
} from '@vicons/material'

import { useGlobalState } from '../store'
import { api } from '../api'
import { getRouterPathWithLang, hashPassword } from '../utils'
import Turnstile from '../components/Turnstile.vue'

import SenderAccess from './admin/SenderAccess.vue'
import Statistics from "./admin/Statistics.vue"
import AccountSettings from './admin/AccountSettings.vue';
import UserManagement from './admin/UserManagement.vue';
import UserSettings from './admin/UserSettings.vue';
import UserOauth2Settings from './admin/UserOauth2Settings.vue';
import RoleAddressConfig from './admin/RoleAddressConfig.vue';
import About from './common/About.vue';
import Maintenance from './admin/Maintenance.vue';
import DatabaseManager from './admin/DatabaseManager.vue';
import Appearance from './common/Appearance.vue';
import Telegram from './admin/Telegram.vue';
import Webhook from './admin/Webhook.vue';
import MailWebhook from './admin/MailWebhook.vue';
import WorkerConfig from './admin/WorkerConfig.vue';
import IpBlacklistSettings from './admin/IpBlacklistSettings.vue';
import AiExtractSettings from './admin/AiExtractSettings.vue';
import RedeemCodes from './admin/RedeemCodes.vue';

const {
  adminAuth, showAdminAuth, adminTab, loading,
  showAdminPage, userSettings,
  openSettings, showUserSystem
} = useGlobalState()
const message = useMessage()
const router = useRouter()

const cfToken = ref('')
const turnstileRef = ref(null)

const authFunc = async () => {
  try {
    await api.fetch('/open_api/admin_login', {
      method: 'POST',
      body: JSON.stringify({
        password: await hashPassword(tmpAdminAuth.value),
        cf_token: cfToken.value
      })
    });
    adminAuth.value = tmpAdminAuth.value;
    location.reload()
  } catch (error) {
    message.error(error.message || "error");
    turnstileRef.value?.refresh?.();
  }
}

const showLogoutModal = ref(false)

const handleLogout = async () => {
  adminAuth.value = '';
  showAdminAuth.value = false;
  adminTab.value = 'statistics';
  message.success(t('logoutSuccess'));
  await router.push(getRouterPathWithLang('/', locale.value));
}

const { t, locale } = useScopedI18n('views.Admin')

const showAdminPasswordModal = computed(() => !showAdminPage.value || showAdminAuth.value)
const tmpAdminAuth = ref('')
const isAdminPasswordLogin = computed(() => !!adminAuth.value)

const currentLoginMethod = computed(() => {
  if (adminAuth.value) {
    return t('loginViaPassword');
  } else if (userSettings.value.is_admin) {
    return t('loginViaUserAdmin');
  } else if (openSettings.value.disableAdminPasswordCheck) {
    return t('loginViaDisabledCheck');
  }
  return '';
})

// System & Operations only (Mailbox list, Creation, and Mails live cleanly on the Homepage!)
const adminNavItems = computed(() => [
  { key: 'statistics', label: t('statistics'), icon: BarChartRound, show: true },
  { key: 'qucickSetup', label: t('qucickSetup'), icon: RocketLaunchOutlined, show: true },
  { key: 'policy', label: t('mailbox_settings'), icon: TuneRound, show: true },
  { key: 'user', label: t('user'), icon: PeopleOutlineRound, show: showUserSystem.value },
  { key: 'telegram', label: t('telegram'), icon: SendOutlined, show: true },
  { key: 'redeemCodes', label: t('redeemCodes'), icon: ConfirmationNumberOutlined, show: openSettings.value.enableRedeemCode },
  { key: 'maintenance', label: t('maintenance'), icon: BuildOutlined, show: true },
  { key: 'appearance', label: t('appearance'), icon: PaletteOutlined, show: true },
  { key: 'adminAccount', label: t('adminAccount'), icon: AdminPanelSettingsOutlined, show: true },
  { key: 'about', label: t('about'), icon: InfoOutlined, show: true },
].filter(item => item.show))

const activeSectionKey = computed(() => {
  const exists = adminNavItems.value.some(item => item.key === adminTab.value)
  return exists ? adminTab.value : 'statistics'
})

const selectSection = (key) => {
  adminTab.value = key
}

onMounted(async () => {
  if (!openSettings.value.fetched) await api.getOpenSettings(message);
  if (!userSettings.value.user_id) await api.getUserSettings(message);
})
</script>

<template>
  <div v-if="openSettings.fetched && userSettings.fetched" class="admin-root">
    <!-- Admin Login Modal -->
    <n-modal v-model:show="showAdminPasswordModal" :closable="false" :closeOnEsc="false" :maskClosable="false"
      preset="dialog" :title="t('accessHeader')">
      <p class="modal-tip">{{ t('accessTip') }}</p>
      <n-input v-model:value="tmpAdminAuth" type="password" show-password-on="click" @keyup.enter="authFunc" />
      <Turnstile ref="turnstileRef" v-if="openSettings.enableGlobalTurnstileCheck" v-model:value="cfToken" />
      <template #action>
        <n-button @click="authFunc" type="primary" :loading="loading">
          {{ t('ok') }}
        </n-button>
      </template>
    </n-modal>

    <div v-if="showAdminPage" class="admin-stack">
      <!-- Top Horizontal Pill Bar (unified with Homepage & User Center!) -->
      <div class="admin-pill-strip" role="tablist">
        <button
          v-for="item in adminNavItems"
          :key="item.key"
          type="button"
          role="tab"
          class="admin-pill-tab"
          :class="{ 'is-active': activeSectionKey === item.key }"
          @click="selectSection(item.key)"
        >
          <n-icon :component="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </button>
      </div>

      <!-- Full-Width Admin Workspace -->
      <section class="admin-workspace app-surface-card">
        <!-- Statistics -->
        <Statistics v-if="activeSectionKey === 'statistics'" />

        <!-- Quick Setup -->
        <div v-else-if="activeSectionKey === 'qucickSetup'">
          <n-tabs key="quick-setup-tabs" type="line" animated class="admin-sub-tabs">
            <n-tab-pane name="database" :tab="t('database')"><DatabaseManager /></n-tab-pane>
            <n-tab-pane name="account_settings" :tab="t('mailbox_settings')"><AccountSettings /></n-tab-pane>
            <n-tab-pane v-if="showUserSystem" name="user_settings" :tab="t('user_settings')"><UserSettings /></n-tab-pane>
            <n-tab-pane name="workerconfig" :tab="t('workerconfig')"><WorkerConfig /></n-tab-pane>
          </n-tabs>
        </div>

        <!-- Global Mailbox Policy & Rules -->
        <div v-else-if="activeSectionKey === 'policy'">
          <n-tabs key="policy-tabs" type="line" animated class="admin-sub-tabs">
            <n-tab-pane name="account_settings" :tab="t('mailbox_settings')"><AccountSettings /></n-tab-pane>
            <n-tab-pane name="senderAccess" :tab="t('senderAccess')"><SenderAccess /></n-tab-pane>
            <n-tab-pane name="ipBlacklistSettings" :tab="t('ipBlacklistSettings')"><IpBlacklistSettings /></n-tab-pane>
            <n-tab-pane name="aiExtractSettings" :tab="t('aiExtractSettings')"><AiExtractSettings /></n-tab-pane>
            <n-tab-pane name="webhook" :tab="t('webhookSettings')"><Webhook /></n-tab-pane>
            <n-tab-pane name="mailWebhook" :tab="t('mailWebhook')"><MailWebhook /></n-tab-pane>
          </n-tabs>
        </div>

        <!-- User Management -->
        <div v-else-if="activeSectionKey === 'user' && showUserSystem">
          <n-tabs key="user-tabs" type="line" animated class="admin-sub-tabs">
            <n-tab-pane name="user_management" :tab="t('user_management')"><UserManagement /></n-tab-pane>
            <n-tab-pane name="user_settings" :tab="t('user_settings')"><UserSettings /></n-tab-pane>
            <n-tab-pane name="userOauth2Settings" :tab="t('userOauth2Settings')"><UserOauth2Settings /></n-tab-pane>
            <n-tab-pane name="roleAddressConfig" :tab="t('roleAddressConfig')"><RoleAddressConfig /></n-tab-pane>
          </n-tabs>
        </div>

        <!-- Telegram -->
        <Telegram v-else-if="activeSectionKey === 'telegram'" />

        <!-- Redeem Codes -->
        <RedeemCodes v-else-if="activeSectionKey === 'redeemCodes' && openSettings.enableRedeemCode" />

        <!-- Maintenance -->
        <div v-else-if="activeSectionKey === 'maintenance'">
          <n-tabs key="maintenance-tabs" type="line" animated class="admin-sub-tabs">
            <n-tab-pane name="database" :tab="t('database')"><DatabaseManager /></n-tab-pane>
            <n-tab-pane name="workerconfig" :tab="t('workerconfig')"><WorkerConfig /></n-tab-pane>
            <n-tab-pane name="maintenance" :tab="t('maintenance')"><Maintenance /></n-tab-pane>
          </n-tabs>
        </div>

        <!-- Appearance -->
        <Appearance v-else-if="activeSectionKey === 'appearance'" />

        <!-- Admin Account -->
        <div v-else-if="activeSectionKey === 'adminAccount'" class="admin-account-wrap">
          <n-card :bordered="false" class="admin-account-card">
            <n-space vertical :size="12">
              <n-text depth="3" style="font-size: 13px;">{{ t('loginMethod') }}</n-text>
              <n-text strong style="font-size: 16px;">{{ currentLoginMethod }}</n-text>
              <n-divider v-if="isAdminPasswordLogin" />
              <n-button v-if="isAdminPasswordLogin" type="warning" secondary @click="showLogoutModal = true" block>
                {{ t('logout') }}
              </n-button>
            </n-space>
          </n-card>
        </div>

        <!-- About -->
        <About v-else-if="activeSectionKey === 'about'" />
      </section>
    </div>

    <!-- Logout Modal -->
    <n-modal v-model:show="showLogoutModal" preset="dialog" :title="t('logoutConfirmTitle')">
      <p>{{ t('logoutConfirmContent') }}</p>
      <template #action>
        <n-button :loading="loading" @click="handleLogout" size="small" secondary type="warning">
          {{ t('confirm') }}
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.admin-root {
  text-align: left;
  min-width: 0;
}

.modal-tip {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--app-text-secondary);
}

.admin-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.admin-pill-strip {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  padding: 3px;
  border-radius: 13px;
  background: var(--app-surface-subtle);
  border: 1px solid var(--app-border);
  -webkit-overflow-scrolling: touch;
}

.admin-pill-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--app-text-secondary);
  font-size: 13.5px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s var(--app-ease);
}

.admin-pill-tab:hover {
  color: var(--app-text);
}

.admin-pill-tab.is-active {
  background: var(--app-surface);
  color: var(--app-text);
  font-weight: 600;
  box-shadow: var(--app-shadow-xs);
}

.admin-workspace {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 16px 20px 22px;
}

.admin-workspace > div {
  min-width: 0;
  max-width: 100%;
}

.admin-sub-tabs :deep(.n-tabs-nav) {
  margin-bottom: 14px;
}

.admin-account-wrap {
  display: block;
  padding: 4px 0;
}

.admin-account-card {
  width: 100%;
}

@media (max-width: 767px) {
  .admin-workspace {
    padding: 12px 12px 16px;
  }
}
</style>

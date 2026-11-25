<script setup>
import { computed } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import {
    AlternateEmailRound, InboxOutlined, SendOutlined,
    CreateOutlined, SettingsOutlined, LinkRound
} from '@vicons/material'

import { useGlobalState } from '../store'

import AddressMangement from './user/AddressManagement.vue';
import UserSettingsPage from './user/UserSettings.vue';
import UserBar from './user/UserBar.vue';
import BindAddress from './user/BindAddress.vue';
import UserMailBox from './user/UserMailBox.vue';
import UserSendBox from './user/UserSendBox.vue';

const {
    userTab, userSettings, openSettings, showUserSystem
} = useGlobalState()

const { t } = useScopedI18n('views.User')
const { t: userMailT } = useScopedI18n('views.user.UserSendBox')

const tabs = computed(() => [
    { name: 'address_management', label: t('address_management'), icon: AlternateEmailRound, show: true },
    { name: 'user_mail_box_tab', label: t('user_mail_box_tab'), icon: InboxOutlined, show: true },
    { name: 'user_sendbox', label: userMailT('sendbox'), icon: SendOutlined, show: openSettings.value.enableSendMail },
    { name: 'user_send_mail', label: t('send_mail'), icon: CreateOutlined, show: openSettings.value.enableSendMail },
    { name: 'user_settings', label: t('user_settings'), icon: SettingsOutlined, show: true },
    { name: 'bind_address', label: t('bind_address'), icon: LinkRound, show: true },
].filter(item => item.show))
</script>

<template>
    <div v-if="showUserSystem" class="user-page">
        <UserBar />
        <template v-if="userSettings.user_email">
            <div class="user-pill-strip">
                <button
                    v-for="item in tabs"
                    :key="item.name"
                    type="button"
                    class="user-pill-tab"
                    :class="{ 'is-active': userTab === item.name }"
                    @click="userTab = item.name"
                >
                    <n-icon :component="item.icon" :size="16" />
                    <span>{{ item.label }}</span>
                </button>
            </div>
            <div class="user-panel app-surface-card">
                <AddressMangement v-if="userTab === 'address_management'" />
                <UserMailBox v-else-if="userTab === 'user_mail_box_tab'" />
                <UserSendBox v-else-if="userTab === 'user_sendbox' && openSettings.enableSendMail" mode="sendbox" />
                <UserSendBox v-else-if="userTab === 'user_send_mail' && openSettings.enableSendMail" mode="send_mail" @sent="userTab = 'user_sendbox'" />
                <UserSettingsPage v-else-if="userTab === 'user_settings'" />
                <BindAddress v-else-if="userTab === 'bind_address'" />
            </div>
        </template>
    </div>
</template>

<style scoped>
.user-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: left;
}

.user-pill-strip {
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

.user-pill-tab {
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

.user-pill-tab.is-active {
    background: var(--app-surface);
    color: var(--app-text);
    font-weight: 600;
    box-shadow: var(--app-shadow-xs);
}

.user-panel {
    padding: 16px 18px;
}

@media (max-width: 767px) {
    .user-panel {
        padding: 12px;
    }
}
</style>

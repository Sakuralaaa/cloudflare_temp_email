<script setup>
import { onMounted, ref } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router'
import { SwapHorizRound, PersonOutlineRound, MarkEmailReadOutlined } from '@vicons/material'

import { useGlobalState } from '../../store'
import { useIsMobile } from '../../utils/composables'
import { api } from '../../api'
import Login from '../common/Login.vue'
import TelegramAddress from './TelegramAddress.vue'
import LocalAddress from './LocalAddress.vue'
import AddressManagement from '../user/AddressManagement.vue'
import { getRouterPathWithLang } from '../../utils'
import AddressSelect from '../../components/AddressSelect.vue'
import AddressCredentialModal from '../../components/AddressCredentialModal.vue'

const router = useRouter()
const isMobile = useIsMobile()

const {
    jwt, settings, showAddressCredential,
    isTelegram, addressPassword, showUserSystem, showUserMailboxes
} = useGlobalState()

const { locale, t } = useScopedI18n('views.index.AddressBar')

const showAddressManage = ref(false)

const openAddressManage = () => {
    showAddressManage.value = true
}

defineExpose({ openAddressManage })

const onUserLogin = async () => {
    await router.push(getRouterPathWithLang("/user", locale.value))
}

onMounted(async () => {
    await api.getSettings();
});
</script>

<template>
    <div class="address-bar-root">
        <!-- Loading skeleton -->
        <div v-if="!settings.fetched" class="app-surface-card skeleton-card">
            <n-skeleton text :repeat="2" />
            <n-skeleton height="280px" style="margin-top: 14px; border-radius: 12px;" />
        </div>

        <!-- Active Mailbox Command Bar -->
        <div v-else-if="settings.address" class="address-command-bar app-surface-card">
            <div class="address-badge-icon" aria-hidden="true">
                <n-icon :component="MarkEmailReadOutlined" :size="18" />
            </div>
            <div class="address-command-main">
                <AddressSelect size="medium">
                    <template #actions>
                        <n-button
                            class="address-manage-btn"
                            size="medium"
                            secondary
                            @click="showAddressManage = true"
                        >
                            <template #icon>
                                <n-icon :component="SwapHorizRound" />
                            </template>
                            {{ t('addressManage') }}
                        </n-button>
                    </template>
                </AddressSelect>
            </div>
        </div>

        <!-- Telegram Mini App -->
        <div v-else-if="isTelegram">
            <TelegramAddress />
        </div>

        <!-- Logged-in Regular User Mailbox Selection -->
        <div v-else-if="showUserMailboxes" class="full-home-wrap">
            <n-card :bordered="false" class="full-home-card">
                <AddressManagement />
            </n-card>
        </div>

        <!-- Welcome / Create / Login -->
        <div v-else class="auth-center">
            <n-card :bordered="false" class="auth-card">
                <n-alert v-if="jwt" type="warning" :show-icon="false" :bordered="false" closable style="margin-bottom: 14px;">
                    <span>{{ t('fetchAddressError') }}</span>
                </n-alert>
                <Login />
                <template v-if="showUserSystem">
                    <n-divider />
                    <n-button @click="onUserLogin" type="primary" block secondary strong size="large">
                        <template #icon>
                            <n-icon :component="PersonOutlineRound" />
                        </template>
                        {{ t('userCenter') }}
                    </n-button>
                </template>
            </n-card>
        </div>

        <AddressCredentialModal
            v-model:show="showAddressCredential"
            :address="settings.address"
            :jwt="jwt"
            :address-password="addressPassword"
        />

        <!-- Desktop Modal / Mobile Bottom Sheet for Address Management -->
        <n-drawer
            v-if="isMobile"
            v-model:show="showAddressManage"
            placement="bottom"
            height="86dvh"
            :trap-focus="false"
            class="address-manage-sheet"
        >
            <n-drawer-content :title="t('addressManage')" closable>
                <TelegramAddress v-if="isTelegram" />
                <AddressManagement v-else-if="showUserMailboxes" />
                <LocalAddress v-else />
            </n-drawer-content>
        </n-drawer>

        <n-modal
            v-else
            v-model:show="showAddressManage"
            preset="card"
            :title="t('addressManage')"
            style="width: min(760px, calc(100vw - 32px));"
        >
            <TelegramAddress v-if="isTelegram" />
            <AddressManagement v-else-if="showUserMailboxes" />
            <LocalAddress v-else />
        </n-modal>
    </div>
</template>

<style scoped>
.address-bar-root {
    margin-bottom: 12px;
}

.skeleton-card {
    padding: 20px;
}

.address-command-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
}

.address-badge-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--app-accent-soft);
    color: var(--app-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.address-command-main {
    flex: 1;
    min-width: 0;
}

.address-manage-btn {
    flex: 0 0 auto;
    white-space: nowrap;
}

.full-home-wrap {
    width: 100%;
}

.full-home-card {
    width: 100%;
    text-align: left;
}

.auth-center {
    display: flex;
    justify-content: center;
    padding: 24px 0 12px;
}

.auth-card {
    width: min(520px, 100%);
    text-align: left;
}

@media (max-width: 640px) {
    .address-command-bar {
        padding: 10px 12px;
        align-items: flex-start;
    }

    .address-badge-icon {
        display: none;
    }

    .auth-center {
        padding: 8px 0;
    }
}
</style>

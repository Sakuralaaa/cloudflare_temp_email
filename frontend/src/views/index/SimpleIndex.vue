<script setup>
import { ref, onMounted, computed, watch, onBeforeUnmount } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useMessage } from 'naive-ui'
import {
    ExitToAppFilled,
    ContentCopyFilled,
    CheckRound,
    RefreshFilled,
    ArrowBackIosNewFilled,
    ArrowForwardIosFilled,
    SettingsFilled
} from '@vicons/material'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import Login from '../common/Login.vue'
import AccountSettings from './AccountSettings.vue'
import { processItem } from '../../utils/email-parser'
import MailContentRenderer from '../../components/MailContentRenderer.vue'
import AddressSelect from '../../components/AddressSelect.vue'
import AddressCredentialModal from '../../components/AddressCredentialModal.vue'

const { jwt, settings, useSimpleIndex, showAddressCredential, openSettings, loading } = useGlobalState()
const message = useMessage()

const currentPage = ref(1)
const totalCount = ref(0)
const currentMail = ref(null)
const showAccountSettingsCard = ref(false)
const currentAutoRefreshInterval = ref(60)
const timer = ref(null)
const copied = ref(false)
let copiedTimer = null

const { t } = useScopedI18n('views.index.SimpleIndex')

const copyAddress = async () => {
    try {
        await navigator.clipboard.writeText(settings.value.address)
        copied.value = true
        clearTimeout(copiedTimer)
        copiedTimer = setTimeout(() => { copied.value = false }, 1800)
        message.success(t('addressCopied'))
    } catch (error) {
        message.error('复制失败')
    }
}

const fetchMails = async () => {
    if (!settings.value.address) return
    try {
        const { results, count } = await api.fetch(`/api/mails?limit=1&offset=${currentPage.value - 1}`)
        totalCount.value = count > 0 ? count : totalCount.value;
        const rawMail = results && results.length > 0 ? results[0] : null
        currentMail.value = rawMail ? await processItem(rawMail) : null
        return true
    } catch (error) {
        console.error('Failed to fetch mails:', error)
        message.error('获取邮件失败')
    }
}

const toggleCurrentMailUnread = async () => {
    if (!currentMail.value || !openSettings.value.enableMailReadStatus) return
    const mail = currentMail.value
    const previousValue = mail.is_unread
    const isUnread = previousValue !== 1
    mail.is_unread = isUnread ? 1 : 0
    try {
        await api.fetch(`/api/mails/${mail.id}/read`, {
            method: 'PATCH',
            body: JSON.stringify({ isUnread }),
            showLoading: false
        })
        message.success(t('readStatusUpdated'))
    } catch {
        mail.is_unread = previousValue
    }
}

const deleteMail = async () => {
    if (!currentMail.value) return;
    try {
        await api.fetch(`/api/mails/${currentMail.value.id}`, { method: 'DELETE' });
        message.success(t('deleteSuccess'));
        currentMail.value = null;
        await refreshMails();
    } catch (error) {
        console.error('Failed to delete mail:', error);
        message.error('删除邮件失败');
    }
}

const refreshMails = async () => {
    if (loading.value) return
    currentPage.value = 1
    showAccountSettingsCard.value = false
    currentAutoRefreshInterval.value = 60
    if (!(await fetchMails())) return
    message.success(t('refreshSuccess'))
}

const currentPageDisplay = computed(() => currentPage.value)
const totalPages = computed(() => Math.max(1, totalCount.value))
const canGoPrev = computed(() => currentPage.value > 1)
const canGoNext = computed(() => currentPage.value < totalPages.value)
const isFirstPage = computed(() => currentPage.value === 1)

const prevPage = async () => {
    if (canGoPrev.value) {
        currentPage.value--
    }
}

const nextPage = async () => {
    if (canGoNext.value) {
        currentPage.value++
    }
}

watch(currentPage, () => {
    fetchMails()
})

onMounted(async () => {
    await api.getSettings()
    await fetchMails()

    timer.value = setInterval(async () => {
        if (!isFirstPage.value) {
            currentAutoRefreshInterval.value = 60
            return
        }

        if (--currentAutoRefreshInterval.value <= 0) {
            await refreshMails()
        }
    }, 1000)
})

onBeforeUnmount(() => {
    clearInterval(timer.value)
})
</script>

<template>
    <div class="simple-shell">
        <div v-if="!settings.address">
            <n-card :bordered="false" class="simple-card">
                <Login />
            </n-card>
        </div>

        <div v-else class="simple-stack">
            <n-card :bordered="false" class="simple-card">
                <div class="simple-address-wrap">
                    <AddressSelect :showCopy="false" size="medium" />
                </div>
                <div class="simple-actions">
                    <n-button @click="refreshMails" :loading="loading" type="primary" secondary size="small">
                        <template #icon><n-icon :component="RefreshFilled" /></template>
                        {{ t('refreshMails') }}
                    </n-button>
                    <n-button @click="copyAddress" :type="copied ? 'success' : 'default'" secondary size="small">
                        <template #icon><n-icon :component="copied ? CheckRound : ContentCopyFilled" /></template>
                        {{ t('copyAddress') }}
                    </n-button>
                    <n-button @click="showAccountSettingsCard = !showAccountSettingsCard" quaternary size="small">
                        <template #icon><n-icon :component="SettingsFilled" /></template>
                        {{ t('mailboxSettings') }}
                    </n-button>
                    <n-button @click="useSimpleIndex = false" quaternary size="small">
                        <template #icon><n-icon :component="ExitToAppFilled" /></template>
                        {{ t('exitSimpleIndex') }}
                    </n-button>
                </div>
                <div v-if="isFirstPage" class="simple-refresh-hint">
                    {{ t('refreshAfter', { msg: Math.max(0, currentAutoRefreshInterval) }) }}
                </div>
            </n-card>

            <n-card v-if="showAccountSettingsCard" :bordered="false" closable
                @close="showAccountSettingsCard = false" :title="t('mailboxSettings')" class="simple-card">
                <AccountSettings />
            </n-card>

            <n-card v-else :bordered="false" class="simple-card mail-view-card">
                <div v-if="totalCount > 1" class="simple-pager">
                    <n-button @click="prevPage" :disabled="!canGoPrev" quaternary size="small">
                        <template #icon><n-icon :component="ArrowBackIosNewFilled" /></template>
                        {{ t('prevPage') }}
                    </n-button>
                    <n-text depth="3" class="pager-count">
                        {{ t('mailCount', { current: currentPageDisplay, total: totalCount }) }}
                    </n-text>
                    <n-button @click="nextPage" :disabled="!canGoNext" quaternary size="small" icon-placement="right">
                        <template #icon><n-icon :component="ArrowForwardIosFilled" /></template>
                        {{ t('nextPage') }}
                    </n-button>
                </div>

                <div v-if="!currentMail" class="no-mail">
                    <n-empty :description="t('noMails')" />
                </div>
                <div v-else>
                    <h2 v-if="currentMail.subject" class="simple-mail-title"
                        :class="{ 'mail-title-unread': openSettings.enableMailReadStatus && currentMail.is_unread === 1 }">
                        {{ currentMail.subject }}
                    </h2>
                    <MailContentRenderer :mail="currentMail" :showEMailTo="false" :showReply="false"
                        :enableUserDeleteEmail="openSettings.enableUserDeleteEmail" :showSaveS3="false"
                        :enableMailReadStatus="openSettings.enableMailReadStatus"
                        :onUpdateMailReadStatus="toggleCurrentMailUnread"
                        :onDelete="deleteMail" />
                </div>
            </n-card>
        </div>
        <AddressCredentialModal v-model:show="showAddressCredential" :address="settings.address" :jwt="jwt" />
    </div>
</template>

<style scoped>
.simple-shell {
    max-width: 760px;
    margin: 0 auto;
    text-align: left;
}

.simple-stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.simple-card {
    width: 100%;
}

.simple-address-wrap {
    margin-bottom: 12px;
}

.simple-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
}

.simple-refresh-hint {
    text-align: center;
    margin-top: 10px;
    font-size: 12px;
    color: var(--app-text-muted);
}

.simple-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    margin-bottom: 14px;
    border-bottom: 1px solid var(--app-border);
}

.pager-count {
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
}

.no-mail {
    padding: 36px 0;
}

.simple-mail-title {
    margin: 0 0 14px;
    font-size: 19px;
    font-weight: 700;
    line-height: 1.35;
    overflow-wrap: anywhere;
}

.mail-title-unread::before {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 8px;
    border-radius: 50%;
    background: var(--app-accent);
    content: '';
    vertical-align: middle;
}
</style>

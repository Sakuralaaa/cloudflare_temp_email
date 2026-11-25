<script setup>
import { computed, ref, watch } from 'vue';
import { useLocalStorage, useSessionStorage } from '@vueuse/core';
import { useScopedI18n } from '@/i18n/app'
import { StarRound, StarBorderRound, SearchRound, FilterAltOutlined, CloseRound } from '@vicons/material'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import MailBox from '../../components/MailBox.vue';

const props = defineProps({
    onCompose: {
        type: Function,
        default: null
    }
})

const { adminMailTabAddress, openSettings } = useGlobalState()
const { t } = useScopedI18n('views.admin.Mails')

const adminSendMailModel = useSessionStorage('sendMailByAdminModel', {
    fromName: '',
    fromMail: '',
    toName: '',
    toMail: '',
    subject: '',
    contentType: 'text',
    content: '',
})

const handleAdminReply = (mail, model) => {
    adminSendMailModel.value = {
        ...model,
        fromMail: mail?.address || '',
    }
    props.onCompose?.()
}

const handleAdminForward = (mail, model) => {
    adminSendMailModel.value = {
        ...model,
        fromMail: mail?.address || '',
    }
    props.onCompose?.()
}

const mailBoxKey = ref(0)

// Keep exact localStorage keys from previous custom deployment so user's saved settings auto-restore
const priorityDomains = useLocalStorage('adminPriorityDomains', [])
const rawMailView = useLocalStorage('adminPriorityMailView', 'all')
const priorityAddresses = useLocalStorage('adminPriorityAddresses', [])
const showPriorityHelp = ref(false)

const mailView = computed({
    get: () => ['all', 'priority', 'other'].includes(rawMailView.value) ? rawMailView.value : 'all',
    set: (val) => { rawMailView.value = val }
})

const normalizeDomains = (list) => {
    if (!Array.isArray(list)) return []
    return [...new Set(
        list
            .filter(item => typeof item === 'string')
            .map(item => item.trim().toLowerCase())
            .filter(Boolean)
    )]
}

const domainOptions = computed(() =>
    normalizeDomains((openSettings.value.domains || []).map(item => typeof item === 'string' ? item : item?.value))
        .map(d => ({ label: d, value: d }))
)

const activePriorityDomains = computed(() => {
    const validSet = new Set(domainOptions.value.map(d => d.value))
    return normalizeDomains(priorityDomains.value).filter(d => validSet.has(d))
})

const normalizedAddressQuery = computed(() => (adminMailTabAddress.value || '').trim().toLowerCase())

const isCurrentAddressPinned = computed(() =>
    Boolean(normalizedAddressQuery.value) && priorityAddresses.value.includes(normalizedAddressQuery.value)
)

const togglePinCurrentAddress = () => {
    const addr = normalizedAddressQuery.value
    if (!addr) return
    if (priorityAddresses.value.includes(addr)) {
        priorityAddresses.value = priorityAddresses.value.filter(a => a !== addr)
    } else {
        priorityAddresses.value = [addr, ...priorityAddresses.value.filter(a => a !== addr)]
    }
}

const removePinnedAddress = (addr) => {
    priorityAddresses.value = priorityAddresses.value.filter(a => a !== addr)
    if (normalizedAddressQuery.value === addr) {
        adminMailTabAddress.value = ''
        queryMail()
    }
}

const selectPinnedAddress = (addr) => {
    if (normalizedAddressQuery.value === addr) {
        adminMailTabAddress.value = ''
    } else {
        adminMailTabAddress.value = addr
    }
    queryMail()
}

const queryMail = () => {
    adminMailTabAddress.value = (adminMailTabAddress.value || '').trim();
    mailBoxKey.value += 1;
}

watch([mailView, activePriorityDomains], () => {
    queryMail()
})

watch(adminMailTabAddress, (nextVal, prevVal) => {
    const trimmed = (nextVal || '').trim()
    if (trimmed && trimmed !== (prevVal || '').trim()) {
        // When jumping from a specific mailbox row, ensure it isn't hidden by a mismatched priority domain filter
        const domain = trimmed.split('@')[1]?.toLowerCase()
        if (mailView.value === 'priority' && domain && !activePriorityDomains.value.includes(domain)) {
            mailView.value = 'all'
        } else if (mailView.value === 'other' && domain && activePriorityDomains.value.includes(domain)) {
            mailView.value = 'all'
        }
        mailBoxKey.value += 1
    }
})

const buildAdminMailsUrl = ({ limit, offset, address, view, domains }) => {
    const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
    })
    if (address?.trim()) {
        params.set('address', address.trim())
    }
    if (view !== 'priority' && view !== 'other') {
        return `/admin/mails?${params}`
    }
    params.set('mode', view === 'priority' ? 'include' : 'exclude')
    normalizeDomains(domains).forEach(d => params.append('domain', d))
    return `/admin/domain_mails?${params}`
}

const fetchMailData = async (limit, offset) => {
    return await api.fetch(buildAdminMailsUrl({
        limit,
        offset,
        address: adminMailTabAddress.value,
        view: mailView.value,
        domains: activePriorityDomains.value,
    }));
}

const deleteMail = async (curMailId) => {
    await api.fetch(`/admin/mails/${curMailId}`, { method: 'DELETE' });
};
</script>

<template>
    <div class="admin-mails-page">
        <!-- Priority Domains & View Filter Card -->
        <div class="filter-panel">
            <div class="filter-panel-header">
                <div class="filter-title-wrap">
                    <n-icon :component="StarRound" :size="16" class="star-accent" />
                    <span class="filter-title">{{ t('priorityDomains').replace(/^★\s*/, '') }}</span>
                    <n-tag v-if="activePriorityDomains.length > 0" size="tiny" type="primary" :bordered="false" round>
                        {{ activePriorityDomains.length }}
                    </n-tag>
                </div>

                <!-- View Switcher -->
                <div class="view-segmented" role="radiogroup" :aria-label="t('mailView')">
                    <button
                        type="button"
                        class="view-seg-btn"
                        :class="{ 'is-active': mailView === 'all' }"
                        @click="mailView = 'all'"
                    >
                        {{ t('allMail') }}
                    </button>
                    <button
                        type="button"
                        class="view-seg-btn"
                        :class="{ 'is-active': mailView === 'priority' }"
                        @click="mailView = 'priority'"
                    >
                        {{ t('priorityMail') }}
                    </button>
                    <button
                        type="button"
                        class="view-seg-btn"
                        :class="{ 'is-active': mailView === 'other' }"
                        @click="mailView = 'other'"
                    >
                        {{ t('otherMail') }}
                    </button>
                </div>
            </div>

            <div class="domain-select-row">
                <n-select
                    v-model:value="priorityDomains"
                    multiple
                    filterable
                    clearable
                    :options="domainOptions"
                    :placeholder="t('choosePriorityDomains')"
                    max-tag-count="responsive"
                    size="small"
                />
                <n-button size="small" quaternary @click="showPriorityHelp = !showPriorityHelp" class="help-toggle-btn">
                    <template #icon><n-icon :component="FilterAltOutlined" /></template>
                </n-button>
            </div>

            <p v-if="showPriorityHelp" class="priority-help-text">
                {{ t('priorityHelp') }}
            </p>

            <n-alert v-if="mailView === 'priority' && activePriorityDomains.length === 0" type="info" :bordered="false" class="empty-priority-alert">
                {{ t('noPriorityDomains') }}
            </n-alert>

            <!-- Address Query & Starred Priority Mailboxes -->
            <div class="address-query-row">
                <n-input-group class="address-input-group">
                    <n-input
                        v-model:value="adminMailTabAddress"
                        :placeholder="t('addressQueryTip')"
                        @keydown.enter="queryMail"
                        clearable
                    >
                        <template #prefix><n-icon :component="SearchRound" /></template>
                    </n-input>
                    <n-button @click="queryMail" type="primary" secondary>
                        {{ t('query') }}
                    </n-button>
                </n-input-group>
                <n-button
                    v-if="normalizedAddressQuery"
                    size="medium"
                    :type="isCurrentAddressPinned ? 'warning' : 'default'"
                    secondary
                    @click="togglePinCurrentAddress"
                    class="pin-btn"
                >
                    <template #icon>
                        <n-icon :component="isCurrentAddressPinned ? StarRound : StarBorderRound" />
                    </template>
                    {{ isCurrentAddressPinned ? t('unpinAddress') : t('pinAddress') }}
                </n-button>
            </div>

            <!-- Pinned Priority Mailboxes Chips -->
            <div v-if="priorityAddresses.length > 0" class="pinned-mailboxes-row">
                <span class="pinned-label">{{ t('priorityMailboxes') }}:</span>
                <div class="pinned-chips">
                    <span
                        v-for="addr in priorityAddresses"
                        :key="addr"
                        class="pinned-chip"
                        :class="{ 'is-active': normalizedAddressQuery === addr }"
                        @click="selectPinnedAddress(addr)"
                    >
                        <span class="pinned-chip-text">{{ addr }}</span>
                        <button
                            type="button"
                            class="pinned-chip-remove"
                            @click.stop="removePinnedAddress(addr)"
                            :aria-label="t('unpinAddress')"
                        >
                            <n-icon :component="CloseRound" :size="12" />
                        </button>
                    </span>
                </div>
            </div>
        </div>

        <!-- MailBox -->
        <MailBox
            :key="mailBoxKey"
            :enableUserDeleteEmail="true"
            :showReply="Boolean(onCompose)"
            :onReplyMail="handleAdminReply"
            :onForwardMail="handleAdminForward"
            :fetchMailData="fetchMailData"
            :deleteMail="deleteMail"
            :showFilterInput="true"
        />
    </div>
</template>

<style scoped>
.admin-mails-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    max-width: 100%;
}

.filter-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--app-surface-subtle);
    border: 1px solid var(--app-border);
    min-width: 0;
}

.filter-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
}

.filter-title-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
}

.star-accent {
    color: #F59E0B;
}

.filter-title {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--app-text);
}

.view-segmented {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 10px;
    background: var(--app-surface);
    border: 1px solid var(--app-border);
}

.view-seg-btn {
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--app-text-secondary);
    font-size: 12.5px;
    font-weight: 500;
    padding: 4px 11px;
    cursor: pointer;
    transition: all 0.14s var(--app-ease);
    white-space: nowrap;
}

.view-seg-btn:hover {
    color: var(--app-text);
}

.view-seg-btn.is-active {
    background: var(--app-accent-soft);
    color: var(--app-accent);
    font-weight: 600;
}

.domain-select-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.domain-select-row :deep(.n-select) {
    flex: 1;
    min-width: 0;
}

.help-toggle-btn {
    flex-shrink: 0;
}

.priority-help-text {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--app-text-muted);
}

.empty-priority-alert {
    font-size: 13px;
}

.address-query-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.address-input-group {
    flex: 1;
    min-width: 0;
}

.pin-btn {
    flex-shrink: 0;
}

.pinned-mailboxes-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding-top: 2px;
}

.pinned-label {
    font-size: 12px;
    color: var(--app-text-muted);
    flex-shrink: 0;
}

.pinned-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
}

.pinned-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    padding: 3px 8px 3px 10px;
    border-radius: 999px;
    background: var(--app-surface);
    border: 1px solid var(--app-border);
    color: var(--app-text-secondary);
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    cursor: pointer;
    transition: all 0.14s var(--app-ease);
}

.pinned-chip:hover {
    border-color: var(--app-accent-border);
    color: var(--app-text);
}

.pinned-chip.is-active {
    background: var(--app-accent-soft);
    border-color: var(--app-accent-border);
    color: var(--app-accent);
    font-weight: 600;
}

.pinned-chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pinned-chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    opacity: 0.65;
    cursor: pointer;
    padding: 0;
}

.pinned-chip-remove:hover {
    opacity: 1;
    background: rgba(128, 128, 128, 0.15);
}

@media (max-width: 640px) {
    .filter-panel {
        padding: 10px 11px;
    }

    .view-segmented {
        width: 100%;
    }

    .view-seg-btn {
        flex: 1;
        text-align: center;
        padding: 5px 6px;
    }

    .address-query-row {
        flex-wrap: wrap;
    }

    .pin-btn {
        width: 100%;
    }
}
</style>

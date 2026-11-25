<script setup>
import { ref, h, onMounted, watch, computed } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import { NBadge, useMessage, NButton, NDropdown, NIcon } from 'naive-ui'
import { useScopedI18n } from '@/i18n/app'
import useClipboard from 'vue-clipboard3'

import { useGlobalState } from '../../store'
import { useIsMobile } from '../../utils/composables'
import { api } from '../../api'
import { hashPassword, utcToLocalDate } from '../../utils'
import {
    SearchRound, ContentCopyOutlined, KeyOutlined,
    MailOutlineRound, MoreHorizRound, StarRound, StarBorderRound
} from '@vicons/material'
import AddressCredentialModal from '../../components/AddressCredentialModal.vue'

const props = defineProps({
    onViewMails: {
        type: Function,
        default: null
    },
    onViewSendBox: {
        type: Function,
        default: null
    },
    onEnterMailbox: {
        type: Function,
        default: null
    }
})

const {
    loading, adminTab, openSettings, jwt,
    adminMailTabAddress, adminSendBoxTabAddress,
    useUTCDate
} = useGlobalState()
const isMobile = useIsMobile()
const message = useMessage()
const { toClipboard } = useClipboard()
const localAddressCache = useLocalStorage('LocalAddressCache', [])
const priorityAddresses = useLocalStorage('adminPriorityAddresses', [])

const { t } = useScopedI18n('views.admin.Account')
const { t: mailT } = useScopedI18n('views.admin.Mails')

const accountView = ref('all') // 'all' | 'priority'

const showEmailCredential = ref(false)
const curEmailCredential = ref("")
const curEmailAddress = ref("")
const curDeleteAddressId = ref(0);
const curClearInboxAddressId = ref(0);
const curClearSentItemsAddressId = ref(0);
const showResetPassword = ref(false);
const curResetPasswordAddressId = ref(0);
const newPassword = ref('');

const checkedRowKeys = ref([]);
const showMultiActionModal = ref(false);
const multiActionProgress = ref({ percentage: 0, tip: '0/0' });
const multiActionTitle = ref('');

const selectedCount = computed(() => checkedRowKeys.value.length);
const showMultiActionBar = computed(() => checkedRowKeys.value.length > 0);

const addressQuery = ref("")
const sortBy = ref("")
const sortOrder = ref("")

const data = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)
const showDeleteAccount = ref(false)
const showClearInbox = ref(false)
const showClearSentItems = ref(false)

const isStarred = (name) => {
    const normalized = String(name || '').trim().toLowerCase()
    return normalized && priorityAddresses.value.includes(normalized)
}

const toggleStar = (name) => {
    const normalized = String(name || '').trim().toLowerCase()
    if (!normalized) return
    if (priorityAddresses.value.includes(normalized)) {
        priorityAddresses.value = priorityAddresses.value.filter(a => a !== normalized)
        if (accountView.value === 'priority') {
            data.value = data.value.filter(row => String(row.name || '').toLowerCase() !== normalized)
            count.value = data.value.length
        }
    } else {
        priorityAddresses.value = [normalized, ...priorityAddresses.value.filter(a => a !== normalized)]
    }
}

const copyText = async (val) => {
    try {
        await toClipboard(val)
        message.success(t("success"))
    } catch (e) {
        message.error(e.message || "error")
    }
}

const openMailsForRow = (row) => {
    adminMailTabAddress.value = row.name
    if (props.onViewMails) {
        props.onViewMails(row.name)
    } else {
        adminTab.value = 'mails'
    }
}

const openSendBoxForRow = (row) => {
    adminSendBoxTabAddress.value = row.name
    if (props.onViewSendBox) {
        props.onViewSendBox(row.name)
    } else {
        adminTab.value = 'sendBox'
    }
}

const toggleRowChecked = (id, checked) => {
    if (checked) {
        if (!checkedRowKeys.value.includes(id)) {
            checkedRowKeys.value = [...checkedRowKeys.value, id]
        }
    } else {
        checkedRowKeys.value = checkedRowKeys.value.filter(k => k !== id)
    }
}

const showCredential = async (row) => {
    try {
        curEmailAddress.value = row.name
        curEmailCredential.value = await api.adminShowAddressCredential(row.id)
        showEmailCredential.value = true
    } catch (error) {
        message.error(error.message || "error");
        showEmailCredential.value = false
        curEmailCredential.value = ""
        curEmailAddress.value = ""
    }
}

const deleteEmail = async () => {
    try {
        await api.adminDeleteAddress(curDeleteAddressId.value)
        message.success(t("success"));
        await fetchData()
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        showDeleteAccount.value = false
    }
}

const clearInbox = async () => {
    try {
        await api.fetch(`/admin/clear_inbox/${curClearInboxAddressId.value}`, {
            method: 'DELETE'
        });
        message.success(t("success"));
        await fetchData()
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        showClearInbox.value = false
    }
}

const clearSentItems = async () => {
    try {
        await api.fetch(`/admin/clear_sent_items/${curClearSentItemsAddressId.value}`, {
            method: 'DELETE'
        });
        message.success(t("success"));
        await fetchData()
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        showClearSentItems.value = false
    }
}

const resetPassword = async () => {
    const normalizedPassword = newPassword.value.trim()
    if (!normalizedPassword) {
        message.error(t("newPassword"));
        return;
    }
    try {
        await api.fetch(`/admin/address/${curResetPasswordAddressId.value}/reset_password`, {
            method: 'POST',
            body: JSON.stringify({
                password: await hashPassword(normalizedPassword)
            })
        });
        message.success(t("passwordResetSuccess"));
        newPassword.value = '';
        showResetPassword.value = false;
    } catch (error) {
        message.error(error.message || "error");
    }
}

const multiActionSelectAll = () => {
    checkedRowKeys.value = data.value.map(item => item.id);
}

const multiActionUnselectAll = () => {
    checkedRowKeys.value = [];
}

const executeBatchOperation = async ({
    shouldSkip = () => false,
    apiCall,
    title,
    operationName = 'operation'
}) => {
    try {
        loading.value = true;
        const selectedAddresses = data.value.filter((item) =>
            checkedRowKeys.value.includes(item.id)
        );

        if (selectedAddresses.length === 0) {
            message.error(t('pleaseSelectAddress'));
            return;
        }

        const failedIds = [];
        const totalCount = selectedAddresses.length;

        multiActionProgress.value = {
            percentage: 0,
            tip: `0/${totalCount}`
        };
        multiActionTitle.value = title;
        showMultiActionModal.value = true;

        for (const [index, address] of selectedAddresses.entries()) {
            try {
                if (!shouldSkip(address)) {
                    await apiCall(address.id);
                }
            } catch (error) {
                console.error(`${operationName} failed for address ${address.id}:`, error);
                failedIds.push(address.id);
            }
            multiActionProgress.value = {
                percentage: Math.floor((index + 1) / totalCount * 100),
                tip: `${index + 1}/${totalCount}`
            };
        }

        await fetchData();
        checkedRowKeys.value = failedIds;
        message.success(t("success"));
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        loading.value = false;
    }
}

const multiActionDeleteAccounts = async () => {
    await executeBatchOperation({
        apiCall: (id) => api.adminDeleteAddress(id),
        title: t('multiDelete') + ' ' + t('success'),
        operationName: 'Delete'
    });
}

const multiActionClearInbox = async () => {
    await executeBatchOperation({
        shouldSkip: (address) => address.mail_count <= 0,
        apiCall: (id) => api.fetch(`/admin/clear_inbox/${id}`, {
            method: 'DELETE'
        }),
        title: t('multiClearInbox') + ' ' + t('success'),
        operationName: 'ClearInbox'
    });
}

const multiActionClearSentItems = async () => {
    await executeBatchOperation({
        shouldSkip: (address) => address.send_count <= 0,
        apiCall: (id) => api.fetch(`/admin/clear_sent_items/${id}`, {
            method: 'DELETE'
        }),
        title: t('multiClearSentItems') + ' ' + t('success'),
        operationName: 'ClearSentItems'
    });
}

const fetchPriorityAccounts = async () => {
    const q = addressQuery.value.trim().toLowerCase()
    const targets = priorityAddresses.value.filter(addr => !q || addr.includes(q))
    if (targets.length === 0) {
        data.value = []
        count.value = 0
        return
    }
    loading.value = true
    try {
        const fetched = []
        const chunkSize = 5
        for (let i = 0; i < targets.length; i += chunkSize) {
            const batch = targets.slice(i, i + chunkSize)
            const results = await Promise.all(batch.map(async (addr) => {
                try {
                    const res = await api.fetch(
                        `/admin/address?limit=10&offset=0&query=${encodeURIComponent(addr)}`,
                        { showLoading: false }
                    )
                    return (res?.results || []).find(r => String(r.name || '').toLowerCase() === addr) || null
                } catch {
                    return null
                }
            }))
            results.filter(Boolean).forEach(r => fetched.push(r))
        }
        data.value = fetched
        count.value = fetched.length
    } finally {
        loading.value = false
    }
}

const fetchData = async () => {
    if (accountView.value === 'priority') {
        await fetchPriorityAccounts()
        return
    }
    try {
        addressQuery.value = addressQuery.value.trim()
        const { results, count: addressCount } = await api.fetch(
            `/admin/address`
            + `?limit=${pageSize.value}`
            + `&offset=${(page.value - 1) * pageSize.value}`
            + (addressQuery.value ? `&query=${encodeURIComponent(addressQuery.value)}` : "")
            + (sortBy.value ? `&sort_by=${sortBy.value}` : "")
            + (sortOrder.value ? `&sort_order=${sortOrder.value}` : "")
        );
        data.value = results;
        if (page.value === 1 || addressCount > 0) {
            count.value = addressCount ?? 0;
        }
    } catch (error) {
        console.error(error);
        message.error(error.message || "error");
    }
}

const searchData = () => {
    if (page.value === 1) {
        fetchData();
    } else {
        page.value = 1;
    }
}

const handleSorterChange = (sorter) => {
    sortBy.value = sorter.columnKey || "";
    sortOrder.value = sorter.order || "";
    if (page.value === 1) {
        fetchData();
    } else {
        page.value = 1;
    }
}

const getRowActionOptions = (row) => {
    const opts = [
        { label: isStarred(row.name) ? mailT('unpinAddress') : mailT('pinAddress'), key: 'star' },
        { label: t('viewMails'), key: 'mails' },
        { label: t('showCredential'), key: 'credential' },
    ]
    if (row.send_count > 0) {
        opts.push({ label: t('viewSendBox'), key: 'sendbox' })
    }
    if (row.mail_count > 0) {
        opts.push({ label: t('clearInbox'), key: 'clearInbox' })
    }
    if (row.send_count > 0) {
        opts.push({ label: t('clearSentItems'), key: 'clearSent' })
    }
    if (openSettings.value?.enableAddressPassword) {
        opts.push({ label: t('resetPassword'), key: 'resetPwd' })
    }
    opts.push({ label: t('delete'), key: 'delete' })
    return opts
}

const handleRowAction = (key, row) => {
    if (key === 'star') {
        toggleStar(row.name)
    } else if (key === 'credential') {
        showCredential(row)
    } else if (key === 'mails') {
        openMailsForRow(row)
    } else if (key === 'sendbox') {
        openSendBoxForRow(row)
    } else if (key === 'clearInbox') {
        curClearInboxAddressId.value = row.id
        showClearInbox.value = true
    } else if (key === 'clearSent') {
        curClearSentItemsAddressId.value = row.id
        showClearSentItems.value = true
    } else if (key === 'resetPwd') {
        curResetPasswordAddressId.value = row.id
        showResetPassword.value = true
    } else if (key === 'delete') {
        curDeleteAddressId.value = row.id
        showDeleteAccount.value = true
    }
}

const columns = computed(() => [
    { type: 'selection' },
    {
        title: "ID",
        key: "id",
        width: 76,
        sorter: accountView.value === 'all',
        sortOrder: sortBy.value === 'id' ? sortOrder.value : false
    },
    {
        title: t('emailAddress'),
        key: "name",
        sorter: accountView.value === 'all',
        sortOrder: sortBy.value === 'name' ? sortOrder.value : false,
        render(row) {
            const starred = isStarred(row.name)
            return h('div', { style: 'display: flex; align-items: center; gap: 6px;' }, [
                h(NButton, {
                    text: true,
                    size: 'small',
                    title: starred ? mailT('unpinAddress') : mailT('pinAddress'),
                    style: starred ? 'color: #F59E0B;' : 'color: var(--app-text-muted);',
                    onClick: () => toggleStar(row.name)
                }, { icon: () => h(NIcon, { component: starred ? StarRound : StarBorderRound, size: 17 }) }),
                h('span', { style: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;' }, row.name),
                h(NButton, {
                    text: true,
                    size: 'tiny',
                    onClick: () => copyText(row.name)
                }, { default: () => '复制' })
            ])
        }
    },
    {
        title: t('created_at'),
        key: "created_at",
        sorter: accountView.value === 'all',
        sortOrder: sortBy.value === 'created_at' ? sortOrder.value : false,
        render(row) {
            return utcToLocalDate(row.created_at, useUTCDate.value);
        }
    },
    {
        title: t('updated_at'),
        key: "updated_at",
        sorter: accountView.value === 'all',
        sortOrder: sortBy.value === 'updated_at' ? sortOrder.value : false,
        render(row) {
            return utcToLocalDate(row.updated_at, useUTCDate.value);
        }
    },
    ...(openSettings.value.enableAddressExpiry ? [{
        title: t('expires_at'),
        key: "expires_at",
        render(row) {
            return row.expires_at ? utcToLocalDate(row.expires_at, useUTCDate.value) : t('neverExpires');
        }
    }] : []),
    {
        title: t('source_meta'),
        key: "source_meta",
        sorter: accountView.value === 'all',
        sortOrder: sortBy.value === 'source_meta' ? sortOrder.value : false,
        render(row) {
            const val = row.source_meta;
            if (!val) return '';
            const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
            const ipv6Regex = /^[0-9a-fA-F:]+$/;
            if (ipv4Regex.test(val) || (val.includes(':') && ipv6Regex.test(val) && !val.startsWith('tg:'))) {
                return h('a', {
                    href: `https://ip.im/${val}`,
                    target: '_blank',
                    rel: 'noopener noreferrer'
                }, val);
            }
            return val;
        }
    },
    {
        title: t('mail_count'),
        key: "mail_count",
        sorter: accountView.value === 'all',
        sortOrder: sortBy.value === 'mail_count' ? sortOrder.value : false,
        render(row) {
            return h(NButton,
                {
                    text: true,
                    onClick: () => openMailsForRow(row)
                },
                {
                    icon: () => h(NBadge, {
                        value: row.mail_count,
                        'show-zero': true,
                        max: 99,
                        type: row.mail_count > 0 ? "info" : "default"
                    }),
                    default: () => row.mail_count > 0 ? t('viewMails') : ""
                }
            )
        }
    },
    {
        title: t('send_count'),
        key: "send_count",
        sorter: accountView.value === 'all',
        sortOrder: sortBy.value === 'send_count' ? sortOrder.value : false,
        render(row) {
            return h(NButton,
                {
                    text: true,
                    onClick: () => {
                        if (row.send_count > 0) {
                            openSendBoxForRow(row);
                        }
                    }
                },
                {
                    icon: () => h(NBadge, {
                        value: row.send_count,
                        'show-zero': true,
                        max: 99,
                        type: row.send_count > 0 ? "success" : "default"
                    }),
                    default: () => row.send_count > 0 ? t('viewSendBox') : ""
                }
            )
        }
    },
    {
        title: t('actions'),
        key: 'actions',
        width: 112,
        render(row) {
            return h(NDropdown, {
                options: getRowActionOptions(row),
                trigger: 'click',
                onSelect: (key) => handleRowAction(key, row)
            }, {
                default: () => h(NButton, { size: 'small', secondary: true }, { default: () => t('actions') })
            })
        }
    }
])

watch([page, pageSize], async () => {
    if (accountView.value === 'all') {
        await fetchData()
    }
})

watch(accountView, async () => {
    checkedRowKeys.value = []
    page.value = 1
    await fetchData()
})

onMounted(async () => {
    await fetchData()
})
</script>

<template>
    <div class="admin-account-page">
        <AddressCredentialModal v-model:show="showEmailCredential" :address="curEmailAddress"
            :jwt="curEmailCredential" />

        <n-modal v-model:show="showDeleteAccount" preset="dialog" :title="t('deleteMailbox')">
            <p>{{ t('deleteTip') }}</p>
            <template #action>
                <n-button :loading="loading" @click="deleteEmail" size="small" secondary type="error">
                    {{ t('deleteMailbox') }}
                </n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showClearInbox" preset="dialog" :title="t('clearInbox')">
            <p>{{ t('clearInboxTip') }}</p>
            <template #action>
                <n-button :loading="loading" @click="clearInbox" size="small" secondary type="error">
                    {{ t('clearInbox') }}
                </n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showClearSentItems" preset="dialog" :title="t('clearSentItems')">
            <p>{{ t('clearSentItemsTip') }}</p>
            <template #action>
                <n-button :loading="loading" @click="clearSentItems" size="small" secondary type="error">
                    {{ t('clearSentItems') }}
                </n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showResetPassword" preset="dialog" :title="t('resetPassword')">
            <n-form-item :label="t('newPassword')">
                <n-input v-model:value="newPassword" type="password" show-password-on="click"
                    @keyup.enter="resetPassword" />
            </n-form-item>
            <template #action>
                <n-button :loading="loading" @click="resetPassword" size="small" secondary type="primary">
                    {{ t('resetPassword') }}
                </n-button>
            </template>
        </n-modal>

        <!-- View Switcher + Search Bar -->
        <div class="top-filter-bar">
            <div class="view-segmented">
                <button
                    type="button"
                    class="view-seg-btn"
                    :class="{ 'is-active': accountView === 'all' }"
                    @click="accountView = 'all'"
                >
                    {{ t('emailAddress') }}
                </button>
                <button
                    type="button"
                    class="view-seg-btn"
                    :class="{ 'is-active': accountView === 'priority' }"
                    @click="accountView = 'priority'"
                >
                    <n-icon :component="StarRound" :size="14" class="star-icon" />
                    <span>{{ mailT('priorityMailboxes').replace(/^★\s*/, '') }}</span>
                    <span v-if="priorityAddresses.length > 0" class="count-pill">{{ priorityAddresses.length }}</span>
                </button>
            </div>

            <n-input-group class="search-group">
                <n-input v-model:value="addressQuery" clearable :placeholder="t('addressQueryTip')"
                    @keydown.enter="searchData">
                    <template #prefix><n-icon :component="SearchRound" /></template>
                </n-input>
                <n-button @click="searchData" type="primary" secondary>
                    {{ t('query') }}
                </n-button>
            </n-input-group>
        </div>

        <n-alert v-if="accountView === 'priority' && priorityAddresses.length === 0" type="info" :bordered="false">
            {{ mailT('noPriorityMailboxes') }}
        </n-alert>

        <!-- Batch Action Bar -->
        <div v-if="showMultiActionBar" class="batch-bar">
            <n-space align="center" :size="6">
                <n-tag type="info" :bordered="false" round>{{ t('selectedItems') }}: {{ selectedCount }}</n-tag>
                <n-button @click="multiActionSelectAll" size="small" quaternary>{{ t('selectAll') }}</n-button>
                <n-button @click="multiActionUnselectAll" size="small" quaternary>{{ t('unselectAll') }}</n-button>
                <n-popconfirm @positive-click="multiActionClearInbox">
                    <template #trigger>
                        <n-button size="small" secondary type="warning">{{ t('multiClearInbox') }}</n-button>
                    </template>
                    {{ t('multiClearInboxTip') }}
                </n-popconfirm>
                <n-popconfirm @positive-click="multiActionClearSentItems">
                    <template #trigger>
                        <n-button size="small" secondary type="warning">{{ t('multiClearSentItems') }}</n-button>
                    </template>
                    {{ t('multiClearSentItemsTip') }}
                </n-popconfirm>
                <n-popconfirm @positive-click="multiActionDeleteAccounts">
                    <template #trigger>
                        <n-button size="small" secondary type="error">{{ t('multiDelete') }}</n-button>
                    </template>
                    {{ t('multiDeleteTip') }}
                </n-popconfirm>
            </n-space>
        </div>

        <!-- Pagination -->
        <div v-if="accountView === 'all'" class="pager-row">
            <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count"
                :page-sizes="[20, 50, 100]" :simple="isMobile" size="small" show-size-picker>
                <template #prefix="{ itemCount }">
                    {{ t('itemCount') }}: {{ itemCount }}
                </template>
            </n-pagination>
        </div>

        <!-- Mobile Card List -->
        <div v-if="isMobile" class="mobile-account-list">
            <div v-for="row in data" :key="row.id" class="mobile-account-card" :class="{ 'is-starred': isStarred(row.name) }">
                <div class="card-top-row">
                    <n-checkbox
                        :checked="checkedRowKeys.includes(row.id)"
                        @update:checked="(val) => toggleRowChecked(row.id, val)"
                    />
                    <button type="button" class="mobile-star-btn" :class="{ 'is-on': isStarred(row.name) }" @click="toggleStar(row.name)">
                        <n-icon :component="isStarred(row.name) ? StarRound : StarBorderRound" :size="18" />
                    </button>
                    <span class="account-email">{{ row.name }}</span>
                    <n-button quaternary circle size="small" @click="copyText(row.name)">
                        <template #icon><n-icon :component="ContentCopyOutlined" /></template>
                    </n-button>
                </div>

                <div class="card-meta-row">
                    <span class="meta-chip">#{{ row.id }}</span>
                    <span class="meta-chip">{{ utcToLocalDate(row.created_at, useUTCDate) }}</span>
                    <span v-if="row.source_meta" class="meta-chip">{{ row.source_meta }}</span>
                </div>

                <div class="card-footer-row">
                    <div class="card-stats">
                        <n-button
                            size="tiny"
                            secondary
                            :type="row.mail_count > 0 ? 'primary' : 'default'"
                            @click="openMailsForRow(row)"
                        >
                            <template #icon><n-icon :component="MailOutlineRound" /></template>
                            {{ row.mail_count }} {{ t('viewMails') }}
                        </n-button>
                        <n-button size="tiny" secondary @click="showCredential(row)">
                            <template #icon><n-icon :component="KeyOutlined" /></template>
                            {{ t('showCredential') }}
                        </n-button>
                    </div>
                    <n-dropdown
                        :options="getRowActionOptions(row)"
                        trigger="click"
                        @select="(k) => handleRowAction(k, row)"
                    >
                        <n-button size="tiny" quaternary>
                            <template #icon><n-icon :component="MoreHorizRound" /></template>
                        </n-button>
                    </n-dropdown>
                </div>
            </div>
        </div>

        <!-- Desktop Data Table -->
        <div v-else class="table-scroll">
            <n-data-table v-model:checked-row-keys="checkedRowKeys" :columns="columns" :data="data" :bordered="false"
                :row-key="row => row.id" remote @update:sorter="handleSorterChange" />
        </div>

        <!-- Multi-action progress modal -->
        <n-modal v-model:show="showMultiActionModal" preset="dialog" :title="multiActionTitle" negative-text="OK">
            <n-space justify="center">
                <n-progress type="circle" status="info" :percentage="multiActionProgress.percentage">
                    <span style="text-align: center">{{ multiActionProgress.tip }}</span>
                </n-progress>
            </n-space>
        </n-modal>
    </div>
</template>

<style scoped>
.admin-account-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.top-filter-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.view-segmented {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 11px;
    background: var(--app-surface-subtle);
    border: 1px solid var(--app-border);
    flex-shrink: 0;
}

.view-seg-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--app-text-secondary);
    font-size: 13px;
    font-weight: 500;
    padding: 5px 12px;
    cursor: pointer;
    transition: all 0.14s var(--app-ease);
    white-space: nowrap;
}

.view-seg-btn.is-active {
    background: var(--app-surface);
    color: var(--app-text);
    font-weight: 600;
    box-shadow: var(--app-shadow-xs);
}

.star-icon {
    color: #F59E0B;
}

.count-pill {
    padding: 0 6px;
    border-radius: 999px;
    background: rgba(245, 158, 11, 0.16);
    color: #D97706;
    font-size: 11.5px;
    font-weight: 600;
}

.search-group {
    flex: 1;
    min-width: 220px;
}

.batch-bar {
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--app-surface-subtle);
    border: 1px solid var(--app-border);
}

.pager-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.table-scroll {
    overflow-x: auto;
}

.table-scroll :deep(.n-data-table) {
    min-width: 960px;
}

.mobile-account-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.mobile-account-card {
    padding: 12px 13px;
    border-radius: 13px;
    background: var(--app-surface-subtle);
    border: 1px solid var(--app-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mobile-account-card.is-starred {
    border-color: rgba(245, 158, 11, 0.35);
}

.card-top-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.mobile-star-btn {
    border: 0;
    background: transparent;
    padding: 2px;
    color: var(--app-text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
}

.mobile-star-btn.is-on {
    color: #F59E0B;
}

.account-email {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--app-text);
    overflow-wrap: anywhere;
}

.card-meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 11.5px;
    color: var(--app-text-muted);
}

.meta-chip {
    padding: 2px 7px;
    border-radius: 6px;
    background: var(--app-surface);
    border: 1px solid var(--app-border);
}

.card-footer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 4px;
    border-top: 1px solid var(--app-border);
}

.card-stats {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
}

@media (max-width: 640px) {
    .view-segmented {
        width: 100%;
    }

    .view-seg-btn {
        flex: 1;
        justify-content: center;
    }
}
</style>

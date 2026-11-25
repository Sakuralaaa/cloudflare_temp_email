<script setup>
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useScopedI18n } from '@/i18n/app'
import { NTag, useMessage } from 'naive-ui'
import useClipboard from 'vue-clipboard3'
import { ContentCopyOutlined, CheckRound } from '@vicons/material'

import { useGlobalState } from '../store'
import { api } from '../api'
import { decodeAddressToken } from '../utils/local-address-cache'

const props = defineProps({
    showCopy: {
        type: Boolean,
        default: true,
    },
    size: {
        type: String,
        default: 'medium',
    },
})

const message = useMessage()
const { toClipboard } = useClipboard()
const copied = ref(false)
let copiedTimer = null
let searchTimer = null

const {
    jwt, userJwt, settings, isTelegram, telegramApp,
    showUserMailboxes, openSettings, showAdminPage
} = useGlobalState()

const { t } = useScopedI18n('components.AddressSelect')
const { t: loginT } = useScopedI18n('views.common.Login')

const localAddressCache = useLocalStorage("LocalAddressCache", [])
const addressOptions = ref([])
const addressValue = ref(null)
const addressLoading = ref(false)
const searchQuery = ref('')
const optionValueMap = new Map()

const showLoginMethodTag = computed(() => {
    const methods = new Set()
    const collect = (items) => {
        for (const item of items) {
            if (item.children) collect(item.children)
            else if (item.loginMethod) methods.add(item.loginMethod)
        }
    }
    collect(addressOptions.value)
    return methods.size > 1
})

const renderLabel = (option) => {
    if (option.type === 'group') return option.label
    const badges = []
    if (typeof option.mailCount === 'number' && option.mailCount > 0) {
        badges.push(h(NTag, { size: 'tiny', type: 'info', bordered: false, round: true, style: 'flex-shrink: 0;' }, () => `${option.mailCount}`))
    }
    if (showLoginMethodTag.value && option.loginMethod) {
        badges.push(h(NTag, { size: 'tiny', bordered: false, style: 'flex-shrink: 0;' }, () => loginT(option.loginMethod)))
    }
    if (badges.length === 0) return option.label
    return h('div', { style: 'display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;' }, [
        h('span', { style: 'overflow: hidden; text-overflow: ellipsis;' }, option.label),
        h('div', { style: 'display: flex; align-items: center; gap: 4px; flex-shrink: 0;' }, badges)
    ])
}

const getOptionValue = (key, scope, payload, address) => {
    const existing = optionValueMap.get(key)
    if (existing) {
        existing.scope = scope
        existing.payload = payload
        existing.address = address
        return existing
    }
    const created = { key, scope, payload, address }
    optionValueMap.set(key, created)
    return created
}

const formatAddressLabel = (address) => {
    if (!address) return ''
    return address
}

const matchesQuery = (text, q) => {
    if (!q) return true
    return String(text || '').toLowerCase().includes(q.toLowerCase())
}

const buildLocalOptions = (excludeAddresses = new Set(), query = '') => {
    if (jwt.value && !localAddressCache.value.includes(jwt.value)) {
        localAddressCache.value.push(jwt.value)
    }
    const byAddress = new Map()
    for (const curJwt of localAddressCache.value) {
        const payload = decodeAddressToken(curJwt);
        const address = payload?.address;
        if (!address || excludeAddresses.has(address)) continue;
        const loginMethod = payload.type === 'address_password_login' ? 'passwordLogin' : 'credentialLogin';
        if (openSettings.value.addressPasswordLoginOnly && loginMethod !== 'passwordLogin') continue;
        const existing = byAddress.get(address)
        if (!existing || curJwt === jwt.value || existing.curJwt !== jwt.value) {
            byAddress.set(address, { curJwt, address, loginMethod })
        }
    }
    return Array.from(byAddress.values())
        .filter(({ address }) => matchesQuery(address, query))
        .map(({ curJwt, address, loginMethod }) => {
            const label = formatAddressLabel(address);
            const key = `local:${curJwt}`;
            const option = { label, value: getOptionValue(key, 'local', curJwt, address), address, loginMethod };
            if (curJwt === jwt.value || (settings.value.address && address === settings.value.address)) {
                addressValue.value = option.value;
            }
            return option;
        });
}

const buildUserOptions = async (query = '') => {
    const children = [];
    try {
        const { results } = await api.fetch(`/user_api/bind_address?limit=100&offset=0`, { showLoading: false });
        for (const row of results || []) {
            const address = row.address || row.name;
            if (!address || !matchesQuery(address, query)) continue;
            const label = formatAddressLabel(address);
            const key = `user:${row.id}`;
            const option = { label, value: getOptionValue(key, 'user', String(row.id), address), address };
            if (settings.value.address && address === settings.value.address) {
                addressValue.value = option.value;
            }
            children.push(option);
        }
    } catch (error) {
        message.error(error.message || "error");
    }
    return children;
}

const buildAdminOptions = async (excludeAddresses = new Set(), query = '') => {
    const children = [];
    try {
        const params = new URLSearchParams({
            limit: '60',
            offset: '0',
            sort_by: 'updated_at',
            sort_order: 'desc',
        });
        if (query.trim()) {
            params.set('query', query.trim());
        }
        const { results } = await api.fetch(`/admin/address?${params}`, {
            showLoading: false,
            silentAdminAuth: true,
        });
        for (const row of results || []) {
            const address = row.name || row.address;
            if (!address || excludeAddresses.has(address)) continue;
            const label = formatAddressLabel(address);
            const key = `admin:${row.id}`;
            const option = {
                label,
                value: getOptionValue(key, 'admin', String(row.id), address),
                address,
                mailCount: row.mail_count ?? 0,
            };
            if (!addressValue.value && settings.value.address && address === settings.value.address) {
                addressValue.value = option.value;
            }
            children.push(option);
        }
    } catch (error) {
        // Silently ignore if admin token expired on homepage
        console.debug('Failed to load admin addresses in selector:', error);
    }
    return children;
}

const buildTelegramOptions = async () => {
    const children = [];
    try {
        const data = await api.fetch(`/telegram/get_bind_address`, {
            method: 'POST',
            body: JSON.stringify({
                initData: telegramApp.value.initData
            })
        });
        for (const row of data || []) {
            if (!row?.address || !row?.jwt) continue;
            const label = formatAddressLabel(row.address);
            const key = `tg:${row.jwt}`;
            const option = { label, value: getOptionValue(key, 'tg', row.jwt, row.address), address: row.address };
            if (settings.value.address && row.address === settings.value.address) {
                addressValue.value = option.value;
            }
            children.push(option);
        }
    } catch (error) {
        message.error(error.message || "error");
    }
    return children;
}

const refreshAddressOptions = async (query = searchQuery.value) => {
    addressLoading.value = true;
    const prevValue = addressValue.value;
    if (!query) addressValue.value = null;
    try {
        if (isTelegram.value) {
            addressOptions.value = await buildTelegramOptions();
            return;
        }
        const groups = [];
        const seen = new Set();

        if (showUserMailboxes.value) {
            const userChildren = await buildUserOptions(query);
            if (userChildren.length > 0) {
                groups.push({ type: 'group', label: t('linkedMailboxes'), children: userChildren });
                userChildren.forEach((item) => seen.add(item.address));
            }
        }

        const localChildren = buildLocalOptions(seen, query);
        if (localChildren.length > 0) {
            groups.push({ type: 'group', label: t('localAddresses'), children: localChildren });
            localChildren.forEach((item) => seen.add(item.address));
        }

        if (showAdminPage.value) {
            const adminChildren = await buildAdminOptions(seen, query);
            if (adminChildren.length > 0) {
                groups.push({ type: 'group', label: t('adminAddresses'), children: adminChildren });
            }
        }

        addressOptions.value = groups;
        if (!addressValue.value && query && prevValue) {
            addressValue.value = prevValue;
        }
    } finally {
        addressLoading.value = false;
    }
}

const handleSearch = (query) => {
    if (!showAdminPage.value || isTelegram.value) return;
    searchQuery.value = query || '';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        refreshAddressOptions(searchQuery.value);
    }, 220);
}

const onAddressChange = async (value) => {
    if (!value) return;
    if (value.scope === 'local' || value.scope === 'tg') {
        jwt.value = value.payload;
        location.reload();
        return;
    }
    if (value.scope === 'user') {
        try {
            const res = await api.fetch(`/user_api/bind_address_jwt/${value.payload}`);
            if (!res?.jwt) {
                message.error("jwt not found");
                return;
            }
            jwt.value = res.jwt;
            location.reload();
        } catch (error) {
            message.error(error.message || "error");
        }
        return;
    }
    if (value.scope === 'admin') {
        try {
            const resJwt = await api.adminShowAddressCredential(value.payload);
            if (!resJwt) {
                message.error("jwt not found");
                return;
            }
            jwt.value = resJwt;
            if (!localAddressCache.value.includes(resJwt)) {
                localAddressCache.value.push(resJwt);
            }
            location.reload();
        } catch (error) {
            message.error(error.message || "error");
        }
    }
}

const copy = async () => {
    try {
        await toClipboard(settings.value.address)
        copied.value = true
        clearTimeout(copiedTimer)
        copiedTimer = setTimeout(() => { copied.value = false }, 1800)
        message.success(t('copied'));
    } catch (e) {
        message.error(e.message || "error");
    }
}

onMounted(async () => {
    await refreshAddressOptions('');
});

onBeforeUnmount(() => {
    clearTimeout(copiedTimer)
    clearTimeout(searchTimer)
})

watch([userJwt, isTelegram, showUserMailboxes, showAdminPage, jwt, localAddressCache, () => settings.value.address, () => openSettings.value.addressPasswordLoginOnly], async () => {
    await refreshAddressOptions(searchQuery.value);
});
</script>

<template>
    <div class="address-row">
        <div class="address-select-wrap">
            <n-select
                v-model:value="addressValue"
                :options="addressOptions"
                :size="size"
                :render-label="renderLabel"
                filterable
                :remote="showAdminPage && !isTelegram"
                :loading="addressLoading"
                :placeholder="formatAddressLabel(settings.address) || t('selectMailbox')"
                @search="handleSearch"
                @update:value="onAddressChange"
                class="address-select"
            />
        </div>
        <div class="address-actions">
            <n-button
                v-if="showCopy"
                class="address-copy"
                @click="copy"
                :size="size"
                :type="copied ? 'success' : 'primary'"
                :secondary="!copied"
            >
                <template #icon>
                    <n-icon :component="copied ? CheckRound : ContentCopyOutlined" />
                </template>
                {{ t('copy') }}
            </n-button>
            <slot name="actions" />
        </div>
    </div>
</template>

<style scoped>
.address-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.address-select-wrap {
    flex: 1;
    min-width: 0;
}

.address-select {
    width: 100%;
}

.address-select :deep(.n-base-selection-label) {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 13.5px;
}

.address-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}

.address-copy {
    flex: 0 0 auto;
    white-space: nowrap;
}

@media (max-width: 640px) {
    .address-row {
        flex-wrap: wrap;
        gap: 8px;
    }

    .address-select-wrap {
        flex: 1 1 100%;
    }

    .address-actions {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
        gap: 8px;
    }

    .address-actions :deep(.n-button) {
        width: 100%;
    }
}
</style>

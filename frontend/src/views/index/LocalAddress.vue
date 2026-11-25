<script setup lang="ts">
import { ref, h, computed } from 'vue';
import { useLocalStorage } from '@vueuse/core';
import { useScopedI18n } from '@/i18n/app'
import { NPopconfirm, NButton, NTag } from 'naive-ui'
import { CheckCircleOutlineRound, SwapHorizRound, DeleteOutlineRound } from '@vicons/material'
import { decodeAddressToken } from '../../utils/local-address-cache'

// @ts-ignore
import { useGlobalState } from '../../store'
// @ts-ignore
import { useIsMobile } from '../../utils/composables'
// @ts-ignore
import Login from '../common/Login.vue';

const { jwt, openSettings } = useGlobalState()
const isMobile = useIsMobile()
// @ts-ignore
const message = useMessage()

const { t } = useScopedI18n('views.index.LocalAddress')
const { t: loginT } = useScopedI18n('views.common.Login')

const tabValue = ref('address')
const localAddressCache = useLocalStorage("LocalAddressCache", []);
const data = computed(() => {
    // @ts-ignore
    if (jwt.value && !localAddressCache.value.includes(jwt.value)) {
        // @ts-ignore
        localAddressCache.value.push(jwt.value)
    }
    return localAddressCache.value.map((curJwt: string) => {
        const payload = decodeAddressToken(curJwt);
        if (!payload) return { valid: false, address: `invalid jwt [${curJwt}]`, jwt: curJwt };
        return {
            valid: true,
            address: payload.address,
            loginMethod: payload.type === 'address_password_login' ? 'passwordLogin' : 'credentialLogin',
            jwt: curJwt
        }
    })
})

const switchAddress = (row: any) => {
    jwt.value = row.jwt
    location.reload()
}

const unbindAddress = (row: any) => {
    if (jwt.value === row.jwt) return;
    localAddressCache.value = localAddressCache.value.filter(
        (curJwt: string) => curJwt !== row.jwt
    );
}

const canSwitch = (row: any) => {
    return !openSettings.value.addressPasswordLoginOnly || row.loginMethod === 'passwordLogin'
}

const bindAddress = async () => {
    try {
        // @ts-ignore
        if (jwt.value && !localAddressCache.value.includes(jwt.value)) {
            // @ts-ignore
            localAddressCache.value.push(jwt.value)
        }
        tabValue.value = 'address'
        message.success(t('bindAddressSuccess'));
    } catch (error) {
        message.error((error as Error).message || "error");
    }
}

const columns = [
    {
        title: t('address'),
        key: "address"
    },
    {
        title: t('loginMethod'),
        key: 'loginMethod',
        render: (row: any) => row.loginMethod
            ? h(NTag, { size: 'small', bordered: false }, () => loginT(row.loginMethod))
            : null,
    },
    {
        title: t('actions'),
        key: 'actions',
        render(row: any) {
            return h('div', { style: 'display: flex; gap: 8px;' }, [
                canSwitch(row) ? h(NPopconfirm,
                    { onPositiveClick: () => switchAddress(row) },
                    {
                        trigger: () => h(NButton,
                            { secondary: true, size: 'small', type: "primary", disabled: jwt.value === row.jwt },
                            { default: () => t('changeMailAddress') }
                        ),
                        default: () => `${t('changeMailAddress')}?`
                    }
                ) : null,
                h(NPopconfirm,
                    { onPositiveClick: () => unbindAddress(row) },
                    {
                        trigger: () => h(NButton,
                            { quaternary: true, size: 'small', disabled: jwt.value === row.jwt, type: "error" },
                            { default: () => t('unbindMailAddress') }
                        ),
                        default: () => `${t('unbindMailAddress')}?`
                    }
                )
            ])
        }
    }
]
const visibleColumns = computed(() => {
    const methods = new Set(data.value.filter(row => row.valid).map(row => row.loginMethod));
    return methods.size > 1 ? columns : columns.filter(column => column.key !== 'loginMethod');
})
</script>

<template>
    <div class="local-address-root">
        <n-alert type="info" :show-icon="false" :bordered="false" class="tip-alert">
            <span>{{ t('tip') }}</span>
        </n-alert>
        <n-tabs type="segment" v-model:value="tabValue" animated>
            <n-tab-pane name="address" :tab="t('address')">
                <!-- Mobile Card List -->
                <div v-if="isMobile" class="mobile-address-list">
                    <div
                        v-for="row in data"
                        :key="row.jwt"
                        class="mobile-address-card"
                        :class="{ 'is-current': jwt === row.jwt }"
                    >
                        <div class="mobile-address-top">
                            <span class="mobile-address-text">{{ row.address }}</span>
                            <n-tag v-if="jwt === row.jwt" size="small" type="primary" :bordered="false" round>
                                <template #icon><n-icon :component="CheckCircleOutlineRound" /></template>
                                Active
                            </n-tag>
                        </div>
                        <div class="mobile-address-actions">
                            <n-popconfirm v-if="canSwitch(row) && jwt !== row.jwt" @positive-click="switchAddress(row)">
                                <template #trigger>
                                    <n-button size="small" type="primary" secondary>
                                        <template #icon><n-icon :component="SwapHorizRound" /></template>
                                        {{ t('changeMailAddress') }}
                                    </n-button>
                                </template>
                                {{ t('changeMailAddress') }}?
                            </n-popconfirm>
                            <n-popconfirm v-if="jwt !== row.jwt" @positive-click="unbindAddress(row)">
                                <template #trigger>
                                    <n-button size="small" type="error" quaternary>
                                        <template #icon><n-icon :component="DeleteOutlineRound" /></template>
                                        {{ t('unbindMailAddress') }}
                                    </n-button>
                                </template>
                                {{ t('unbindMailAddress') }}?
                            </n-popconfirm>
                        </div>
                    </div>
                </div>

                <!-- Desktop Table -->
                <div v-else class="address-table-scroll">
                    <n-data-table :columns="visibleColumns" :data="data" :bordered="false" />
                </div>
            </n-tab-pane>
            <n-tab-pane name="create_or_bind" :tab="t('create_or_bind')">
                <Login :bindUserAddress="bindAddress" />
            </n-tab-pane>
        </n-tabs>
    </div>
</template>

<style scoped>
.local-address-root {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.tip-alert {
    font-size: 13px;
}

.address-table-scroll {
    max-width: 100%;
    overflow-x: auto;
}

.mobile-address-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 6px;
}

.mobile-address-card {
    padding: 13px 14px;
    border-radius: 13px;
    background: var(--app-surface-subtle);
    border: 1px solid var(--app-border);
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.mobile-address-card.is-current {
    background: var(--app-accent-soft);
    border-color: var(--app-accent-border);
}

.mobile-address-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.mobile-address-text {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--app-text);
    overflow-wrap: anywhere;
}

.mobile-address-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
</style>

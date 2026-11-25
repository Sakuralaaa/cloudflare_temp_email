<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { CasinoOutlined } from '@vicons/material'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { resolveExpiryPayload } from '../../utils'
import AddressCredentialModal from '../../components/AddressCredentialModal.vue'
import BatchCreate from './BatchCreate.vue'

const {
    loading, openSettings,
} = useGlobalState()
const message = useMessage()

const { t } = useScopedI18n('views.admin.CreateAccount')

const enablePrefix = ref(true)
const subdomainMode = ref("normal")
const customSubdomain = ref("")
const emailName = ref("")
const emailDomain = ref("")
const expiryMode = ref("never")
const expiresAt = ref(null)
const expiryOptions = computed(() => [
    { label: t('neverExpires'), value: 'never' },
    { label: t('expiry1h'), value: '1h' },
    { label: t('expiry24h'), value: '24h' },
    { label: t('expiry3d'), value: '3d' },
    { label: t('expiry7d'), value: '7d' },
    { label: t('expiry30d'), value: '30d' },
    { label: t('expiryCustom'), value: 'custom' },
])
const showReultModal = ref(false)
const result = ref("")
const addressPassword = ref("")
const createdAddress = ref("")

const busy = ref(false)
const creationMode = ref('single')

const invalidDomain = computed(() => !emailDomain.value
    || (subdomainMode.value === "custom" && !customSubdomain.value.trim()))
const invalidExpiry = computed(() => {
    if (!openSettings.value.enableAddressExpiry || expiryMode.value !== 'custom') return false
    if (typeof expiresAt.value !== 'number' || !Number.isFinite(expiresAt.value)) return true
    if (Number.isNaN(new Date(expiresAt.value).getTime())) return true
    return Math.floor(expiresAt.value / 1000) <= Math.floor(Date.now() / 1000)
})
const batchOptions = computed(() => ({
    enablePrefix: enablePrefix.value,
    enableRandomSubdomain: subdomainMode.value === 'random',
    domain: subdomainMode.value === 'custom'
        ? `${customSubdomain.value.trim()}.${emailDomain.value}`
        : emailDomain.value,
    expiryMode: openSettings.value.enableAddressExpiry ? expiryMode.value : 'never',
    customExpiresAt: expiresAt.value,
}))

const addressRegex = computed(() => {
    try {
        if (openSettings.value.addressRegex) {
            return new RegExp(openSettings.value.addressRegex, 'g');
        }
    } catch (error) {
        console.error(error);
        message.error(`Invalid addressRegex: ${openSettings.value.addressRegex}`);
    }
    return /[^a-z0-9]/g;
});

const generateNameLoading = ref(false);
const generateName = async () => {
    try {
        generateNameLoading.value = true;
        const { faker } = await import('https://esm.sh/@faker-js/faker');
        emailName.value = faker.internet.email()
            .split('@')[0]
            .toLowerCase()
            .replace(/\s+/g, '.')
            .replace(/\.{2,}/g, '.')
            .replace(addressRegex.value, '');
        if (emailName.value.length > openSettings.value.maxAddressLen) {
            emailName.value = emailName.value.slice(0, openSettings.value.maxAddressLen);
        }
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        generateNameLoading.value = false;
    }
};

const canUseRandomSubdomain = computed(() => {
    if (!emailDomain.value) {
        return false
    }
    return (openSettings.value.randomSubdomainDomains || []).includes(emailDomain.value)
})

watch(canUseRandomSubdomain, (enabled) => {
    if (!enabled) {
        subdomainMode.value = "normal"
    }
})

const newEmail = async () => {
    if (busy.value || generateNameLoading.value) return
    if (!emailName.value || invalidDomain.value) {
        message.error(t('fillInAllFields'))
        return
    }
    let expiryPayload = {}
    if (openSettings.value.enableAddressExpiry) {
        expiryPayload = resolveExpiryPayload(expiryMode.value, expiresAt.value)
        if (!expiryPayload) {
            message.error(t('invalidExpiryDateTime'))
            return
        }
    }
    busy.value = true
    try {
        const domain = subdomainMode.value === "custom"
            ? `${customSubdomain.value.trim()}.${emailDomain.value}`
            : emailDomain.value
        const res = await api.fetch(`/admin/new_address`, {
            method: 'POST',
            body: JSON.stringify({
                enablePrefix: enablePrefix.value,
                enableRandomSubdomain: subdomainMode.value === "random",
                name: emailName.value,
                domain,
                ...expiryPayload,
            })
        })
        result.value = res["jwt"];
        addressPassword.value = res["password"] || '';
        createdAddress.value = res["address"] || '';
        message.success(t('successTip'))
        showReultModal.value = true
    } catch (error) {
        message.error(error.message || "error");
    } finally {
        busy.value = false
    }
}

onMounted(async () => {
    if (openSettings.prefix) {
        enablePrefix.value = true
    }
    emailDomain.value = openSettings.value.domains?.[0]?.value || ""
})
</script>

<template>
    <div class="create-account-wrap">
        <AddressCredentialModal v-model:show="showReultModal" :address="createdAddress" :jwt="result"
            :address-password="addressPassword" />
        <div class="create-card">
            <n-form-item-row :label="t('creationMode')">
                <n-radio-group v-model:value="creationMode" name="admin-creation-mode" :disabled="busy || generateNameLoading">
                    <n-space>
                        <n-radio value="single">{{ t('singleMode') }}</n-radio>
                        <n-radio value="batch">{{ t('batchMode') }}</n-radio>
                    </n-space>
                </n-radio-group>
            </n-form-item-row>
            <n-form-item-row v-if="openSettings.prefix" :label="t('enablePrefix')">
                <n-switch :disabled="busy" v-model:value="enablePrefix" :round="false" />
            </n-form-item-row>
            <n-form-item-row :label="t(creationMode === 'single' ? 'address' : 'domain')">
                <n-spin :show="generateNameLoading" style="width: 100%;">
                    <div class="address-builder">
                        <div v-if="creationMode === 'single'" class="name-row">
                            <n-input-group class="name-group">
                                <n-input-group-label v-if="enablePrefix && openSettings.prefix">
                                    {{ openSettings.prefix }}
                                </n-input-group-label>
                                <n-input :disabled="busy" v-model:value="emailName" />
                            </n-input-group>
                            <n-button :disabled="busy" secondary @click="generateName" class="gen-btn">
                                <template #icon><n-icon :component="CasinoOutlined" /></template>
                                {{ t('generateName') }}
                            </n-button>
                        </div>
                        <div class="domain-row">
                            <span v-if="creationMode === 'single'" class="at-chip">@</span>
                            <n-select
                                :disabled="busy"
                                v-model:value="emailDomain"
                                filterable
                                :consistent-menu-width="false"
                                :options="openSettings.domains"
                                class="domain-select"
                            />
                        </div>
                    </div>
                </n-spin>
            </n-form-item-row>
            <n-form-item-row v-if="canUseRandomSubdomain">
                <div style="width: 100%;">
                    <n-radio-group :disabled="busy" v-model:value="subdomainMode">
                        <n-space vertical>
                            <n-radio value="normal">{{ t('normalSubdomain') }}</n-radio>
                            <n-radio value="random">{{ t('enableRandomSubdomain') }}</n-radio>
                            <n-radio value="custom">{{ t('enableCustomSubdomain') }}</n-radio>
                        </n-space>
                    </n-radio-group>
                    <p v-if="subdomainMode === 'random'" style="margin: 8px 0 0; opacity: 0.75;">
                        {{ t('randomSubdomainTip') }}
                    </p>
                    <n-input-group v-if="subdomainMode === 'custom'" style="margin-top: 8px;">
                        <n-input :disabled="busy" v-model:value="customSubdomain" />
                        <n-input-group-label>.{{ emailDomain }}</n-input-group-label>
                    </n-input-group>
                </div>
            </n-form-item-row>
            <n-form-item-row v-if="openSettings.enableAddressExpiry" :label="t('expiresAt')">
                <div style="width: 100%;">
                    <n-select v-model:value="expiryMode" :disabled="busy" :options="expiryOptions" />
                    <n-date-picker v-if="expiryMode === 'custom'" v-model:value="expiresAt"
                        type="datetime" format="yyyy-MM-dd HH:mm:ss" clearable :disabled="busy"
                        :placeholder="t('selectExpiryDateTime')"
                        :is-date-disabled="(ts) => ts < new Date().setHours(0, 0, 0, 0)"
                        style="width: 100%; margin-top: 8px;" />
                </div>
            </n-form-item-row>
            <n-button v-if="creationMode === 'single'" @click="newEmail" type="primary" block strong size="large" :loading="loading"
                :disabled="busy || generateNameLoading || invalidDomain || invalidExpiry">
                {{ t('createEmailAddress') }}
            </n-button>
            <BatchCreate v-show="creationMode === 'batch'" :options="batchOptions" :address-regex="addressRegex"
                :disabled="invalidDomain || invalidExpiry || generateNameLoading || creationMode !== 'batch'" @busy="busy = $event" />
        </div>
    </div>
</template>

<style scoped>
.create-account-wrap {
    display: block;
    padding: 4px 0;
}

.create-card {
    width: min(680px, 100%);
    text-align: left;
}

.address-builder {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.name-row,
.domain-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.name-group,
.domain-select {
    flex: 1;
    min-width: 0;
}

.gen-btn {
    flex-shrink: 0;
}

.at-chip {
    width: 36px;
    height: 38px;
    border-radius: 10px;
    background: var(--app-surface-subtle);
    border: 1px solid var(--app-border);
    color: var(--app-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    flex-shrink: 0;
}

@media (max-width: 480px) {
    .name-row {
        flex-direction: column;
        align-items: stretch;
    }

    .gen-btn {
        width: 100%;
    }
}
</style>

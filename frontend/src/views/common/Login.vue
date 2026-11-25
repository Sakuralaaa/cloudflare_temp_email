<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useScopedI18n } from '@/i18n/app'
import { useRouter } from 'vue-router'
import { NewLabelOutlined, EmailOutlined, RedeemOutlined, CasinoOutlined } from '@vicons/material'

import AdminContact from '../common/AdminContact.vue'
import Turnstile from '../../components/Turnstile.vue'

import { useGlobalState } from '../../store'
import { api } from '../../api'
import { getRouterPathWithLang, hashPassword, resolveExpiryPayload } from '../../utils'

const props = defineProps({
    bindUserAddress: {
        type: Function,
        default: async () => { await api.bindUserAddress(); },
        required: true
    },
    newAddressPath: {
        type: Function,
        default: async (address_name, domain, cf_token, enableRandomSubdomain, expiryPayload = {}) => {
            return await api.fetch("/api/new_address", {
                method: "POST",
                body: JSON.stringify({
                    name: address_name,
                    domain: domain,
                    cf_token: cf_token,
                    enableRandomSubdomain: enableRandomSubdomain,
                    ...expiryPayload,
                }),
            });
        },
        required: true
    },
    enableExpiry: {
        type: Boolean,
        default: true,
    },
})

const message = useMessage()
const notification = useNotification()
const router = useRouter()

const {
    jwt, loading, openSettings,
    showAddressCredential, userSettings, addressPassword
} = useGlobalState()

const tabValue = ref('signin')
const credential = ref('')
const emailName = ref("")
const emailDomain = ref("")
const cfToken = ref("")
const subdomainMode = ref("normal")
const customSubdomain = ref("")
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
const loginCfToken = ref("")
const loginTurnstileRef = ref(null)
const loginMethod = ref('credential')
const loginAddress = ref('')
const loginPassword = ref('')

const initLoginMethod = () => {
    if (openSettings.value?.enableAddressPassword) {
        loginMethod.value = 'password';
    } else {
        loginMethod.value = 'credential';
    }
}

const login = async () => {
    if (loginMethod.value === 'password') {
        if (!loginAddress.value || !loginPassword.value) {
            message.error(t('emailPasswordRequired'));
            return;
        }
        try {
            const res = await api.fetch('/api/address_login', {
                method: 'POST',
                body: JSON.stringify({
                    email: loginAddress.value,
                    password: await hashPassword(loginPassword.value),
                    cf_token: loginCfToken.value
                })
            });
            jwt.value = res.jwt;
            await api.getSettings();
            try {
                await props.bindUserAddress();
            } catch (error) {
                message.error(`${t('bindUserAddressError')}: ${error.message}`);
            }
            await router.push(getRouterPathWithLang("/", locale.value));
        } catch (error) {
            message.error(error.message || "error");
            loginTurnstileRef.value?.refresh?.();
        }
        return;
    }
    if (!credential.value) {
        message.error(t('credentialInput'));
        return;
    }
    try {
        await api.fetch('/open_api/credential_login', {
            method: 'POST',
            body: JSON.stringify({
                credential: credential.value,
                cf_token: loginCfToken.value
            })
        });
        jwt.value = credential.value;
        await api.getSettings();
        try {
            await props.bindUserAddress();
        } catch (error) {
            message.error(`${t('bindUserAddressError')}: ${error.message}`);
        }
        await router.push(getRouterPathWithLang("/", locale.value));
    } catch (error) {
        message.error(error.message || "error");
        loginTurnstileRef.value?.refresh?.();
    }
}

const { locale, t } = useScopedI18n('views.common.Login')

const loginAndBindTag = computed(() => {
    if (userSettings.value.user_email) {
        return t('loginAndBind')
    }
    return t('login')
})

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

const expiryEnabled = computed(() => props.enableExpiry && openSettings.value.enableAddressExpiry);

const newEmail = async () => {
    try {
        let expiryPayload = {};
        if (expiryEnabled.value) {
            expiryPayload = resolveExpiryPayload(expiryMode.value, expiresAt.value);
            if (!expiryPayload) {
                message.error(t('invalidExpiryDateTime'));
                return;
            }
        }
        const nameToSend = openSettings.value.disableCustomAddressName ? "" : emailName.value;
        const domainToSend = subdomainMode.value === "custom"
            ? `${customSubdomain.value.trim()}.${emailDomain.value}`
            : emailDomain.value;
        const res = await props.newAddressPath(
            nameToSend,
            domainToSend,
            cfToken.value,
            subdomainMode.value === "random",
            expiryPayload
        );
        jwt.value = res["jwt"];
        addressPassword.value = res["password"] || '';
        await api.getSettings();
        await router.push(getRouterPathWithLang("/", locale.value));
        showAddressCredential.value = true;
        try {
            await props.bindUserAddress();
        } catch (error) {
            message.error(`${t('bindUserAddressError')}: ${error.message}`);
        }
    } catch (error) {
        message.error(error.message || "error");
    }
};

const openRedeemPage = async () => {
    await router.push(getRouterPathWithLang('/redeem', locale.value));
};

const addressPrefix = computed(() => {
    if (userSettings.value?.user_role) {
        return userSettings.value.user_role.prefix || "";
    }
    return openSettings.value.prefix;
});

const canUseRandomSubdomain = computed(() => {
    if (!emailDomain.value) {
        return false;
    }
    return (openSettings.value.randomSubdomainDomains || []).includes(emailDomain.value);
});

watch(canUseRandomSubdomain, (enabled) => {
    if (!enabled) {
        subdomainMode.value = "normal";
    }
});

const domainsOptions = computed(() => {
    if (userSettings.value.user_role) {
        const allDomains = userSettings.value.user_role.domains;
        if (!allDomains) return openSettings.value.domains;
        return openSettings.value.domains.filter((domain) => {
            return allDomains.includes(domain.value);
        });
    }
    if (!openSettings.value.defaultDomains) {
        return openSettings.value.domains;
    }
    return openSettings.value.domains.filter((domain) => {
        return openSettings.value.defaultDomains.includes(domain.value);
    });
});

const showNewAddressTab = computed(() => {
    if (openSettings.value.disableAnonymousUserCreateEmail
        && !userSettings.value.user_email
    ) {
        return false;
    }
    return openSettings.value.enableUserCreateEmail;
});

onMounted(async () => {
    if (!openSettings.value.domains || openSettings.value.domains.length === 0) {
        await api.getOpenSettings(message, notification);
    }
    emailDomain.value = domainsOptions.value ? domainsOptions.value[0]?.value : "";
    initLoginMethod();
});
</script>

<template>
    <div class="login-root">
        <n-alert v-if="userSettings.user_email" type="info" :show-icon="false" :bordered="false" closable class="bind-info-alert">
            <span>{{ t('bindUserInfo') }}</span>
        </n-alert>

        <n-tabs v-if="openSettings.fetched" v-model:value="tabValue" type="segment" animated>
            <n-tab-pane name="signin" :tab="loginAndBindTag">
                <n-form class="login-form">
                    <div v-if="loginMethod === 'password'">
                        <n-form-item-row :label="t('email')" required>
                            <n-input v-model:value="loginAddress" size="large" />
                        </n-form-item-row>
                        <n-form-item-row :label="t('password')" required>
                            <n-input v-model:value="loginPassword" size="large" type="password" show-password-on="click"
                                @keyup.enter="login" />
                        </n-form-item-row>
                    </div>

                    <div v-else>
                        <n-form-item-row :label="t('credential')" required>
                            <n-input v-model:value="credential" type="textarea" :autosize="{ minRows: 3 }" />
                        </n-form-item-row>
                    </div>

                    <Turnstile ref="loginTurnstileRef" v-if="openSettings.enableGlobalTurnstileCheck"
                        v-model:value="loginCfToken" />

                    <div v-if="openSettings?.enableAddressPassword && !openSettings.addressPasswordLoginOnly" class="switch-login-button">
                        <n-button
                            @click="loginMethod === 'password' ? loginMethod = 'credential' : loginMethod = 'password'"
                            type="primary" quaternary size="small">
                            {{ loginMethod === 'password' ? t('credentialLogin') : t('passwordLogin') }}
                        </n-button>
                    </div>

                    <div class="form-cta-stack">
                        <n-button @click="login" :loading="loading" type="primary" block strong size="large">
                            <template #icon>
                                <n-icon :component="EmailOutlined" />
                            </template>
                            {{ loginAndBindTag }}
                        </n-button>
                        <n-button v-if="showNewAddressTab" @click="tabValue = 'register'" block secondary strong size="large">
                            <template #icon>
                                <n-icon :component="NewLabelOutlined" />
                            </template>
                            {{ t('getNewEmail') }}
                        </n-button>
                    </div>

                    <div v-if="openSettings.enableRedeemCode" class="redeem-entry-section">
                        <n-divider />
                        <n-text depth="3" class="redeem-entry-tip">{{ t('redeemEntryTip') }}</n-text>
                        <n-button data-testid="redeem-entry" block secondary strong @click="openRedeemPage">
                            <template #icon>
                                <n-icon :component="RedeemOutlined" />
                            </template>
                            {{ t('useRedeemCode') }}
                        </n-button>
                    </div>
                </n-form>
            </n-tab-pane>

            <n-tab-pane v-if="showNewAddressTab" name="register" :tab="t('getNewEmail')">
                <n-spin :show="generateNameLoading">
                    <n-form class="login-form">
                        <div class="register-tips">
                            <p v-if="!openSettings.disableCustomAddressName">{{ t("getNewEmailTip1") + addressRegex.source }}</p>
                            <p v-if="!openSettings.disableCustomAddressName">{{ t("getNewEmailTip2") }}</p>
                            <p>{{ t("getNewEmailTip3") }}</p>
                        </div>

                        <div class="address-builder">
                            <div class="address-name-row">
                                <n-input-group class="name-input-group">
                                    <n-input-group-label v-if="addressPrefix">
                                        {{ addressPrefix }}
                                    </n-input-group-label>
                                    <n-input
                                        v-if="!openSettings.disableCustomAddressName"
                                        v-model:value="emailName"
                                        size="large"
                                        show-count
                                        :minlength="openSettings.minAddressLen"
                                        :maxlength="openSettings.maxAddressLen"
                                    />
                                    <n-input v-else size="large" :value="t('autoGeneratedName')" disabled />
                                </n-input-group>
                                <n-button
                                    v-if="!openSettings.disableCustomAddressName"
                                    @click="generateName"
                                    size="large"
                                    secondary
                                    :title="t('generateName')"
                                    class="random-name-btn"
                                >
                                    <template #icon><n-icon :component="CasinoOutlined" /></template>
                                    {{ t('generateName') }}
                                </n-button>
                            </div>

                            <div class="address-domain-row">
                                <span class="at-badge">@</span>
                                <n-select
                                    v-model:value="emailDomain"
                                    size="large"
                                    filterable
                                    :consistent-menu-width="false"
                                    :options="domainsOptions"
                                    class="domain-select"
                                />
                            </div>
                        </div>

                        <n-form-item-row v-if="canUseRandomSubdomain" style="margin-top: 12px;">
                            <div style="width: 100%;">
                                <n-radio-group v-model:value="subdomainMode">
                                    <n-space vertical>
                                        <n-radio value="normal">{{ t('normalSubdomain') }}</n-radio>
                                        <n-radio value="random">{{ t('enableRandomSubdomain') }}</n-radio>
                                        <n-radio value="custom">{{ t('enableCustomSubdomain') }}</n-radio>
                                    </n-space>
                                </n-radio-group>
                                <p v-if="subdomainMode === 'random'" class="sub-hint">
                                    {{ t('randomSubdomainTip') }}
                                </p>
                                <n-input-group v-if="subdomainMode === 'custom'" style="margin-top: 8px;">
                                    <n-input v-model:value="customSubdomain" />
                                    <n-input-group-label>.{{ emailDomain }}</n-input-group-label>
                                </n-input-group>
                            </div>
                        </n-form-item-row>

                        <n-form-item-row v-if="expiryEnabled" :label="t('expiresAt')" style="margin-top: 12px;">
                            <div style="width: 100%;">
                                <n-select v-model:value="expiryMode" :options="expiryOptions" />
                                <n-date-picker v-if="expiryMode === 'custom'" v-model:value="expiresAt"
                                    type="datetime" format="yyyy-MM-dd HH:mm:ss" clearable
                                    :placeholder="t('selectExpiryDateTime')"
                                    :is-date-disabled="(ts) => ts < new Date().setHours(0, 0, 0, 0)"
                                    style="width: 100%; margin-top: 8px;" />
                            </div>
                        </n-form-item-row>

                        <Turnstile v-model:value="cfToken" />

                        <div class="form-cta-stack">
                            <n-button type="primary" block strong size="large" @click="newEmail" :loading="loading"
                                :disabled="(subdomainMode === 'custom' && !customSubdomain.trim()) || (expiryEnabled && expiryMode === 'custom' && !expiresAt)">
                                <template #icon>
                                    <n-icon :component="NewLabelOutlined" />
                                </template>
                                {{ t('getNewEmail') }}
                            </n-button>
                        </div>

                        <div v-if="openSettings.enableRedeemCode" class="redeem-entry-section">
                            <n-divider />
                            <n-text depth="3" class="redeem-entry-tip">{{ t('redeemEntryTip') }}</n-text>
                            <n-button data-testid="redeem-entry-register" block secondary strong
                                @click="openRedeemPage">
                                <template #icon>
                                    <n-icon :component="RedeemOutlined" />
                                </template>
                                {{ t('useRedeemCode') }}
                            </n-button>
                        </div>
                    </n-form>
                </n-spin>
            </n-tab-pane>

            <n-tab-pane name="help" :tab="t('help')">
                <n-alert type="info" :show-icon="false" :bordered="false" style="margin-top: 12px;">
                    <span>{{ t('pleaseGetNewEmail') }}</span>
                </n-alert>
                <div style="margin-top: 12px;">
                    <AdminContact />
                </div>
            </n-tab-pane>
        </n-tabs>
    </div>
</template>

<style scoped>
.login-root {
    width: 100%;
}

.bind-info-alert {
    margin-bottom: 12px;
}

.login-form {
    text-align: left;
    margin-top: 14px;
}

.register-tips {
    font-size: 13px;
    line-height: 1.55;
    color: var(--app-text-secondary);
    margin-bottom: 14px;
}

.register-tips p {
    margin: 0 0 4px;
}

.address-builder {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.address-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.name-input-group {
    flex: 1;
    min-width: 0;
}

.random-name-btn {
    flex-shrink: 0;
}

.address-domain-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.at-badge {
    width: 38px;
    height: 44px;
    border-radius: 10px;
    background: var(--app-surface-subtle);
    border: 1px solid var(--app-border);
    color: var(--app-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 600;
    flex-shrink: 0;
}

.domain-select {
    flex: 1;
    min-width: 0;
}

.sub-hint {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: var(--app-text-muted);
}

.switch-login-button {
    display: flex;
    justify-content: flex-end;
    margin: 2px 0 8px;
}

.form-cta-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
}

.redeem-entry-section {
    margin-top: 18px;
}

.redeem-entry-section :deep(.n-divider) {
    margin: 0 0 12px;
}

.redeem-entry-tip {
    display: block;
    font-size: 13px;
    line-height: 1.6;
    text-align: center;
    margin-bottom: 10px;
}

@media (max-width: 480px) {
    .address-name-row {
        flex-direction: column;
        align-items: stretch;
    }

    .random-name-btn {
        width: 100%;
    }
}
</style>

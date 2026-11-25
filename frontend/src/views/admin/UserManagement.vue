<script setup>
import { ref, h, onMounted, watch, computed } from 'vue';
import { useScopedI18n } from '@/i18n/app'
import { NMenu, NButton, NBadge, NTag, NDropdown } from 'naive-ui';
import {
    MenuFilled, SearchRound, PersonAddOutlined,
    AlternateEmailRound, MoreHorizRound
} from '@vicons/material'

import { useGlobalState } from '../../store'
import { useIsMobile } from '../../utils/composables'
import { api } from '../../api'
import { hashPassword, utcToLocalDate } from '../../utils';

import UserAddressManagement from './UserAddressManagement.vue'

const { loading, openSettings, useUTCDate } = useGlobalState()
const isMobile = useIsMobile()
const message = useMessage()

const { t } = useScopedI18n('views.admin.UserManagement')
const data = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(20)

const userQuery = ref('')
const showResetPassword = ref(false)
const newResetPassword = ref('')
const showDeleteUser = ref(false)
const curUserId = ref(0)
const showCreateUser = ref(false)
const user = ref({
    email: "",
    password: ""
})
const showChangeRole = ref(false)
const showUserAddressManagement = ref(false)
const userRoles = ref([])
const curUserRole = ref('')
const userRolesOptions = computed(() => {
    return userRoles.value.map(role => ({
        label: role.role,
        value: role.role
    }));
})

const fetchUserRoles = async () => {
    try {
        const results = await api.fetch(`/admin/user_roles`);
        userRoles.value = results;
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const fetchData = async () => {
    try {
        userQuery.value = userQuery.value.trim()
        const { results, count: userCount } = await api.fetch(
            `/admin/users`
            + `?limit=${pageSize.value}`
            + `&offset=${(page.value - 1) * pageSize.value}`
            + (userQuery.value ? `&query=${userQuery.value}` : '')
        );
        data.value = results;
        if (userCount > 0) {
            count.value = userCount;
        }
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const resetPassword = async () => {
    if (!newResetPassword.value) {
        message.error(t('pleaseInput'));
        return;
    }
    try {
        await api.fetch(`/admin/users/${curUserId.value}/reset_password`, {
            method: "POST",
            body: JSON.stringify({
                password: await hashPassword(newResetPassword.value)
            })
        });
        message.success(t('success'));
        showResetPassword.value = false;
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const createUser = async () => {
    if (!user.value.email || !user.value.password) {
        message.error(t('pleaseInput'));
        return;
    }
    try {
        await api.fetch(`/admin/users`, {
            method: "POST",
            body: JSON.stringify({
                email: user.value.email,
                password: await hashPassword(user.value.password)
            })
        });
        message.success(t('success'));
        await fetchData();
        showCreateUser.value = false;
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const deleteUser = async () => {
    try {
        await api.fetch(`/admin/users/${curUserId.value}`, {
            method: "DELETE"
        });
        message.success(t('success'));
        showDeleteUser.value = false;
        await fetchData();
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const changeRole = async () => {
    try {
        await api.fetch(`/admin/user_roles`, {
            method: "POST",
            body: JSON.stringify({
                user_id: curUserId.value,
                role_text: curUserRole.value
            })
        });
        message.success(t('success'));
        showChangeRole.value = false;
        await fetchData();
    } catch (error) {
        console.log(error)
        message.error(error.message || "error");
    }
}

const getMobileActionOptions = (row) => [
    ...(row.address_count > 0 ? [{ label: t('userAddressManagement'), key: 'addresses' }] : []),
    { label: t('changeRole'), key: 'role' },
    { label: t('resetPassword'), key: 'password' },
    { label: t('delete'), key: 'delete' },
]

const handleMobileAction = (key, row) => {
    curUserId.value = row.id
    if (key === 'addresses') {
        showUserAddressManagement.value = true
    } else if (key === 'role') {
        curUserRole.value = row.role_text
        showChangeRole.value = true
    } else if (key === 'password') {
        newResetPassword.value = ''
        showResetPassword.value = true
    } else if (key === 'delete') {
        user.value.email = ''
        user.value.password = ''
        showDeleteUser.value = true
    }
}

const columns = [
    { title: "ID", key: "id", width: 72 },
    { title: t('user_email'), key: "user_email" },
    {
        title: t('role'),
        key: "role_text",
        render(row) {
            if (!row.role_text) return null;
            return h(NTag, { bordered: false, type: "info", size: 'small' }, { default: () => row.role_text })
        }
    },
    {
        title: t('address_count'),
        key: "address_count",
        render(row) {
            return h(NButton,
                {
                    text: true,
                    onClick: () => {
                        if (row.address_count <= 0) return;
                        curUserId.value = row.id;
                        showUserAddressManagement.value = true;
                    }
                },
                {
                    icon: () => h(NBadge, {
                        value: row.address_count,
                        'show-zero': true,
                        max: 99,
                        type: "info"
                    }),
                    default: () => row.address_count > 0 ? t('userAddressManagement') : ""
                }
            )
        }
    },
    {
        title: t('created_at'),
        key: "created_at",
        render(row) {
            return utcToLocalDate(row.created_at, useUTCDate.value);
        }
    },
    {
        title: t('actions'),
        key: 'actions',
        width: 112,
        render(row) {
            return h(NDropdown, {
                options: getMobileActionOptions(row),
                trigger: 'click',
                onSelect: (key) => handleMobileAction(key, row)
            }, {
                default: () => h(NButton, { size: 'small', secondary: true }, { default: () => t('actions') })
            })
        }
    }
]

const getRolePrefix = (role) => {
    const res = userRoles.value.find(r => r.role === role)?.prefix;
    if (res === undefined || res === null) return openSettings.value.prefix;
    return res;
}

const getRoleDomains = (role) => {
    const res = userRoles.value.find(r => r.role === role)?.domains;
    if (res === undefined || res === null || res.length == 0) return openSettings.value.defaultDomains;
    return res;
}

const roleDonotExist = computed(() => {
    return curUserRole.value && !userRoles.value.some(r => r.role === curUserRole.value);
})

watch([page, pageSize], async () => {
    await fetchData()
})

onMounted(async () => {
    await fetchUserRoles();
    await fetchData();
})
</script>

<template>
    <div class="user-mgmt-page">
        <n-modal v-model:show="showCreateUser" preset="dialog" :title="t('createUser')">
            <n-form>
                <n-form-item-row :label="t('email')" required>
                    <n-input v-model:value="user.email" />
                </n-form-item-row>
                <n-form-item-row :label="t('password')" required>
                    <n-input v-model:value="user.password" type="password" show-password-on="click"
                        @keyup.enter="createUser" />
                </n-form-item-row>
            </n-form>
            <template #action>
                <n-button :loading="loading" @click="createUser" size="small" secondary type="primary">
                    {{ t('createUser') }}
                </n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showResetPassword" preset="dialog" :title="t('resetPassword')">
            <n-form-item-row :label="t('password')" required>
                <n-input v-model:value="newResetPassword" type="password" show-password-on="click"
                    @keyup.enter="resetPassword" />
            </n-form-item-row>
            <template #action>
                <n-button :loading="loading" @click="resetPassword" size="small" secondary type="primary">
                    {{ t('resetPassword') }}
                </n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showDeleteUser" preset="dialog" :title="t('deleteUser')">
            <p>{{ t('deleteUserTip') }}</p>
            <template #action>
                <n-button :loading="loading" @click="deleteUser" size="small" secondary type="error">
                    {{ t('deleteUser') }}
                </n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showChangeRole" preset="dialog" :title="t('changeRole')">
            <n-alert type="error" :bordered="false" v-if="roleDonotExist">
                <span>{{ t('roleDonotExist') }}</span>
            </n-alert>
            <p>{{ t('prefix') + ": " + getRolePrefix(curUserRole) }}</p>
            <p>{{ t('domains') + ": " + JSON.stringify(getRoleDomains(curUserRole)) }}</p>
            <n-select clearable v-model:value="curUserRole" :options="userRolesOptions" />
            <template #action>
                <n-button :loading="loading" @click="changeRole" size="small" secondary type="primary">
                    {{ t('changeRole') }}
                </n-button>
            </template>
        </n-modal>

        <n-modal v-model:show="showUserAddressManagement" preset="card" :title="t('userAddressManagement')"
            style="width: min(740px, calc(100vw - 24px));">
            <UserAddressManagement :user_id="curUserId" />
        </n-modal>

        <!-- Toolbar -->
        <div class="toolbar-row">
            <n-input-group class="search-group">
                <n-input v-model:value="userQuery" clearable @keydown.enter="fetchData">
                    <template #prefix><n-icon :component="SearchRound" /></template>
                </n-input>
                <n-button @click="fetchData" type="primary" secondary>{{ t('query') }}</n-button>
            </n-input-group>
            <n-button @click="showCreateUser = true" type="primary" secondary class="create-btn">
                <template #icon><n-icon :component="PersonAddOutlined" /></template>
                {{ t('createUser') }}
            </n-button>
        </div>

        <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="count"
            :page-sizes="[20, 50, 100]" :simple="isMobile" size="small" show-size-picker>
            <template #prefix="{ itemCount }">
                {{ t('itemCount') }}: {{ itemCount }}
            </template>
        </n-pagination>

        <!-- Mobile Card View -->
        <div v-if="isMobile" class="mobile-user-list">
            <div v-for="row in data" :key="row.id" class="mobile-user-card">
                <div class="user-card-top">
                    <span class="user-email">{{ row.user_email }}</span>
                    <n-tag v-if="row.role_text" size="tiny" type="info" :bordered="false" round>
                        {{ row.role_text }}
                    </n-tag>
                </div>
                <div class="user-card-meta">
                    <span>#{{ row.id }}</span>
                    <span>{{ utcToLocalDate(row.created_at, useUTCDate) }}</span>
                </div>
                <div class="user-card-footer">
                    <n-button
                        size="tiny"
                        secondary
                        :type="row.address_count > 0 ? 'primary' : 'default'"
                        :disabled="row.address_count <= 0"
                        @click="() => { curUserId = row.id; showUserAddressManagement = true; }"
                    >
                        <template #icon><n-icon :component="AlternateEmailRound" /></template>
                        {{ row.address_count }}
                    </n-button>
                    <n-dropdown
                        :options="getMobileActionOptions(row)"
                        trigger="click"
                        @select="(k) => handleMobileAction(k, row)"
                    >
                        <n-button size="tiny" quaternary>
                            <template #icon><n-icon :component="MoreHorizRound" /></template>
                        </n-button>
                    </n-dropdown>
                </div>
            </div>
        </div>

        <!-- Desktop Table -->
        <div v-else class="table-scroll">
            <n-data-table :columns="columns" :data="data" :bordered="false" />
        </div>
    </div>
</template>

<style scoped>
.user-mgmt-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.toolbar-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.search-group {
    flex: 1;
    min-width: 200px;
}

.create-btn {
    flex-shrink: 0;
}

.table-scroll {
    overflow-x: auto;
}

.table-scroll :deep(.n-data-table) {
    min-width: 780px;
}

.mobile-user-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.mobile-user-card {
    padding: 12px 13px;
    border-radius: 13px;
    background: var(--app-surface-subtle);
    border: 1px solid var(--app-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.user-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.user-email {
    font-size: 14px;
    font-weight: 600;
    color: var(--app-text);
    overflow-wrap: anywhere;
}

.user-card-meta {
    display: flex;
    gap: 10px;
    font-size: 12px;
    color: var(--app-text-muted);
}

.user-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 6px;
    border-top: 1px solid var(--app-border);
}
</style>

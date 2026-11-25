<script setup>
import { computed, defineAsyncComponent, ref, useId, watch } from 'vue'
import { useAsyncState } from '@vueuse/core'
import { useThemeVars } from 'naive-ui'
import {
    DateRangeOutlined, KeyboardArrowDownOutlined, RefreshOutlined,
    MailOutlineRound, AlternateEmailRound, PeopleOutlineRound,
    SendOutlined, TrendingUpRound
} from '@vicons/material'
import { useScopedI18n } from '@/i18n/app'
import { api } from '../../api'
const StatisticsTrend = defineAsyncComponent(() => import('./StatisticsTrend.vue'))
const chartGroup = `statistics-${useId()}`

const DAY = 86400000
const presets = [{ days: 1, label: 'today' }, { days: 7, label: 'days7' }, { days: 30, label: 'days30' }]
const { t, locale } = useScopedI18n('views.admin.Statistics')
const numberFormat = computed(() => new Intl.NumberFormat(locale.value))
const format = value => numberFormat.value.format(value)
const theme = useThemeVars()
const utcDay = () => new Date().toISOString().slice(0, 10)
const presetRange = (days, today = utcDay()) => [new Date(Date.parse(today) - (days - 1) * DAY).toISOString().slice(0, 10), today]
const range = ref(presetRange(7))
const preset = ref(presets[1])
const showTime = ref(false)
const draftRange = ref([...range.value])
const allTotalMetrics = [
    { key: 'mailCount', icon: MailOutlineRound },
    { key: 'addressCount', icon: AlternateEmailRound },
    { key: 'userCount', icon: PeopleOutlineRound },
    { key: 'sendMailCount', icon: SendOutlined },
    { key: 'activeAddressCount7days', icon: TrendingUpRound },
    { key: 'activeAddressCount30days', icon: TrendingUpRound },
    { key: 'activeUserCount7days', icon: PeopleOutlineRound },
    { key: 'activeUserCount30days', icon: PeopleOutlineRound },
]
const from = computed(() => range.value[0])
const to = computed(() => range.value[1])
const validRange = dates => dates && Date.parse(dates[1]) - Date.parse(dates[0]) < 30 * DAY
const draftError = computed(() => validRange(draftRange.value) ? '' : t('rangeLimit'))
const rangeLabel = computed(() => preset.value ? t(preset.value.label) : range.value.join(' – '))
const panels = computed(() => [
    { metric: 'mailCount', title: t('received'), color: theme.value.primaryColor },
    { metric: 'sendMailCount', title: t('sent'), color: theme.value.warningColorPressed },
    { metric: 'userCount', title: t('newUsers'), color: theme.value.textColor2 },
    { metric: 'addressCount', title: t('newAddresses'), color: theme.value.infoColor },
])
const colors = computed(() => ({
    '--text': theme.value.textColor1, '--line': theme.value.borderColor,
}))

const fetchDashboard = async (params, previousTotals) => {
    const data = await api.fetch(`/admin/statistics?${new URLSearchParams(params)}`, { showLoading: false })
    // Backward compatibility with v1.13.x backends that return flat totals without `trends`
    if (!data || !data.trends || typeof data.trends !== 'object') {
        const flatTotals = {
            mailCount: data?.mailCount ?? 0,
            addressCount: data?.addressCount ?? 0,
            userCount: data?.userCount ?? 0,
            sendMailCount: data?.sendMailCount ?? 0,
            activeAddressCount7days: data?.activeAddressCount7days ?? 0,
            activeAddressCount30days: data?.activeAddressCount30days ?? 0,
            ...(data?.activeUserCount7days != null ? { activeUserCount7days: data.activeUserCount7days } : {}),
            ...(data?.activeUserCount30days != null ? { activeUserCount30days: data.activeUserCount30days } : {}),
        }
        return { daily: [], totals: flatTotals, supportsTrends: false }
    }
    const counts = Object.entries(data.trends).map(([key, rows]) => [key, new Map((rows || []).map(row => [row.day, row.count]))])
    const start = Date.parse(params.from.slice(0, 10))
    const length = (Date.parse(params.to.slice(0, 10)) - start) / DAY
    const daily = Array.from({ length }, (_, i) => {
        const day = new Date(start + i * DAY).toISOString().slice(0, 10)
        return { day, ...Object.fromEntries(counts.map(([key, values]) => [key, values.get(day) ?? 0])) }
    })
    return { daily, totals: data.totals ?? previousTotals, supportsTrends: true }
}

const { state: statistics, isLoading: loading, error, executeImmediate: loadStatistics } = useAsyncState(
    fetchDashboard, null, { immediate: false, resetOnExecute: false, onError: () => {} },
)
const totals = computed(() => statistics.value?.totals)
const supportsTrends = computed(() => statistics.value?.supportsTrends !== false)

const visibleMetrics = computed(() => {
    if (!totals.value) return allTotalMetrics.slice(0, 6)
    return allTotalMetrics.filter(m => totals.value[m.key] != null)
})

const fetchStatistics = (refresh = false) => {
    const endDay = new Date(Date.parse(to.value) + DAY).toISOString().slice(0, 10)
    const params = { from: `${from.value} 00:00:00`, to: `${endDay} 00:00:00`, granularity: 'day' }
    if (refresh || !totals.value) params.includeTotals = 'true'
    return loadStatistics(params, totals.value)
}
const loadError = computed(() => error.value ? error.value.message || t('loadError') : '')
const syncPresetRange = () => {
    const today = utcDay()
    if (!preset.value || to.value === today) return false
    range.value = presetRange(preset.value.days, today)
    return true
}
const refreshVersion = ref(0)
const refresh = () => {
    syncPresetRange()
    refreshVersion.value++
}
const selectPreset = option => {
    preset.value = option
    range.value = presetRange(option.days)
    showTime.value = false
}
const applyRange = (_, dates) => {
    if (!validRange(dates)) return
    showTime.value = false
    if (dates[0] === from.value && dates[1] === to.value) return
    preset.value = null
    range.value = dates
}
watch(showTime, value => { if (value) draftRange.value = [...range.value] })
watch([from, to, refreshVersion], ([, , version], [, , previousVersion] = []) => {
    if (!syncPresetRange()) fetchStatistics(version !== previousVersion)
}, { immediate: true })
</script>

<template>
    <section class="dashboard" :style="colors" :aria-busy="loading">
        <div class="filters">
            <div class="toolbar-actions">
                <n-popover v-if="supportsTrends" v-model:show="showTime" trigger="click" placement="bottom-end" :show-arrow="false" :style="{ padding: 0 }">
                    <template #trigger>
                        <n-button :disabled="loading" :aria-label="t('dateRange')" :aria-expanded="showTime" aria-haspopup="dialog" :title="`${from} – ${to}`">
                            <template #icon><n-icon :component="DateRangeOutlined" /></template>
                            {{ rangeLabel }}<n-icon :component="KeyboardArrowDownOutlined" />
                        </n-button>
                    </template>
                    <div class="time-panel" role="dialog" :aria-label="t('dateRange')" @keydown.esc="showTime = false">
                        <n-scrollbar style="max-height: 60vh">
                            <div class="quick-ranges">
                                <n-button v-for="option in presets" :key="option.days" size="small" :type="preset?.days === option.days ? 'primary' : 'default'"
                                    :secondary="preset?.days === option.days" @click="selectPreset(option)">{{ t(option.label) }}</n-button>
                                <n-tag size="small" :bordered="false">UTC</n-tag>
                            </div>
                            <n-date-picker v-model:formatted-value="draftRange" value-format="yyyy-MM-dd" panel type="daterange" :actions="['confirm']"
                                :is-date-disabled="timestamp => timestamp > new Date(`${utcDay()}T00:00:00`).getTime()" @confirm="applyRange">
                                <template #footer><span class="range-help">{{ draftError || t('rangeHelp') }}</span></template>
                                <template #confirm="{ onConfirm, disabled }"><n-button size="small" type="primary" :disabled="disabled || !!draftError" @click="onConfirm">{{ t('applyRange') }}</n-button></template>
                            </n-date-picker>
                        </n-scrollbar>
                    </div>
                </n-popover>
                <n-button secondary type="primary" :loading="loading" :disabled="loading" @click="refresh">
                    <template #icon><n-icon :component="RefreshOutlined" /></template>{{ t('refresh') }}
                </n-button>
            </div>
        </div>
        <n-alert v-if="loadError" type="error" class="error">{{ loadError }}</n-alert>
        <div class="totals">
            <div v-for="item in visibleMetrics" :key="item.key" class="stat-card">
                <div class="stat-card-top">
                    <span class="stat-label">{{ t(item.key) }}</span>
                    <span class="stat-icon">
                        <n-icon :component="item.icon" :size="17" />
                    </span>
                </div>
                <div class="stat-value">
                    <n-skeleton v-if="loading && totals?.[item.key] == null" height="28px" width="84px" />
                    <span v-else>{{ totals?.[item.key] != null ? format(totals[item.key]) : '—' }}</span>
                </div>
            </div>
        </div>
        <div v-if="loading && supportsTrends" class="charts"><n-skeleton v-for="panel in panels" :key="panel.metric" height="322px" /></div>
        <div v-else-if="!loadError && supportsTrends && statistics?.daily.length" class="charts">
            <StatisticsTrend v-for="panel in panels" :key="panel.metric" v-bind="panel" :points="statistics.daily" :group="chartGroup" />
        </div>
    </section>
</template>

<style scoped>
.dashboard { color: var(--text); font-variant-numeric: tabular-nums; text-align: left; }
.filters { padding-bottom: 14px; border-bottom: 1px solid var(--app-border); margin-bottom: 18px; }
.toolbar-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 10px; }
.time-panel { max-width: calc(100vw - 24px); }
.time-panel :deep(.n-scrollbar-container) { overscroll-behavior: contain; }
.quick-ranges { display: flex; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--n-divider-color); }
.range-help { font-size: 12px; }
.charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.totals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
.stat-card {
    padding: 16px 18px;
    border-radius: 14px;
    background: var(--app-surface-subtle);
    border: 1px solid var(--app-border);
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.stat-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.stat-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--app-text-secondary);
}
.stat-icon {
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: var(--app-surface);
    color: var(--app-accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.stat-value {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--app-text);
    line-height: 1.2;
}
.error { margin-bottom: 16px; }
@media (max-width: 900px) {
    .totals { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
}
@media (max-width: 650px) {
    .charts { grid-template-columns: 1fr; gap: 14px; }
    .totals { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .stat-card { padding: 13px 14px; }
    .stat-value { font-size: 22px; }
    .time-panel :deep(.n-date-panel--daterange) { grid-template-areas: "left-calendar" "right-calendar" "footer" "action"; }
    .time-panel :deep(.n-date-panel__vertical-divider) { display: none; }
}
</style>

'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/utils/api-client'
import { useAppStore } from '@/lib/store'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Database,
  Server,
  Wrench,
  Rocket,
  Plus,
  Wifi,
  WifiOff,
  AlertCircle,
  Clock,
  Activity,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Stats {
  totalConnections: number
  connectedConnections: number
  activeServers: number
  totalServers: number
  totalTools: number
  totalDeployments: number
  apiStats?: {
    total: number
    passed: number
    failed: number
    avgDuration: number
  }
}

interface ConnectionSummary {
  id: string
  name: string
  host: string
  database: string
  status: string
  lastTested: string | null
}

interface RecentActivity {
  id: string
  type: 'connection' | 'server' | 'tool' | 'deployment'
  message: string
  timestamp: string
  status: 'success' | 'warning' | 'error'
}

// Maps an ActivityLog action string to a RecentActivity status
function logStatus(action: string): 'success' | 'warning' | 'error' {
  if (action.includes('fail') || action.includes('error') || action.includes('delete')) return 'error'
  if (action.includes('warn') || action.includes('suggest')) return 'warning'
  return 'success'
}

// Maps an ActivityLog entityType to a RecentActivity type
function logType(entityType: string): RecentActivity['type'] {
  if (entityType === 'connection' || entityType === 'schema') return 'connection'
  if (entityType === 'server') return 'server'
  if (entityType === 'tool') return 'tool'
  if (entityType === 'deployment') return 'deployment'
  return 'server'
}

const activityIcons = {
  connection: Database,
  server: Server,
  tool: Wrench,
  deployment: Rocket,
}

const activityColors = {
  success: 'text-emerald-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
}

const statusConfig = {
  connected: { icon: Wifi, color: 'text-emerald-500', badge: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25' },
  disconnected: { icon: WifiOff, color: 'text-muted-foreground', badge: 'bg-muted text-muted-foreground border-border' },
  error: { icon: AlertCircle, color: 'text-red-500', badge: 'bg-red-500/15 text-red-500 border-red-500/25' },
}

export function DashboardPage() {
  const setShowConnectionDialog = useAppStore((s) => s.setShowConnectionDialog)
  const setShowServerDialog = useAppStore((s) => s.setShowServerDialog)
  const setShowToolDialog = useAppStore((s) => s.setShowToolDialog)

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: () => api.get<Stats>('/api/stats'),
  })

  const { data: connections } = useQuery<ConnectionSummary[]>({
    queryKey: ['connections-summary'],
    queryFn: () => api.get<ConnectionSummary[]>('/api/connections'),
  })

  // Fetch real activity logs from Turso (replaces static mockActivities)
  const { data: recentActivities = [] } = useQuery<RecentActivity[]>({
    queryKey: ['recent-activity'],
    queryFn: async () => {
      const logs = await api.get<any[]>('/api/logs?limit=6')
      return logs.map((log: { id: string; action: string; entityType: string; entityName: string; createdAt: string }) => ({
        id: log.id,
        type: logType(log.entityType),
        message: `${log.entityName} — ${log.action.replace(/_/g, ' ')}`,
        timestamp: log.createdAt,
        status: logStatus(log.action),
      }))
    },
    staleTime: 30_000,
  })

  const statCards = [
    {
      title: 'Total Connections',
      value: stats?.totalConnections ?? 0,
      subtitle: `${stats?.connectedConnections ?? 0} active`,
      icon: Database,
      iconBg: 'bg-emerald-500/10 text-emerald-500',
    },
    {
      title: 'Active Servers',
      value: stats?.activeServers ?? 0,
      subtitle: `of ${stats?.totalServers ?? 0} total`,
      icon: Server,
      iconBg: 'bg-sky-500/10 text-sky-500',
    },
    {
      title: 'Total Tools',
      value: stats?.totalTools ?? 0,
      subtitle: 'MCP tool definitions',
      icon: Wrench,
      iconBg: 'bg-amber-500/10 text-amber-500',
    },
    {
      title: 'Deployments',
      value: stats?.totalDeployments ?? 0,
      subtitle: 'Total deployments',
      icon: Rocket,
      iconBg: 'bg-purple-500/10 text-purple-500',
    },
  ]

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-10 rounded-lg" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-6 w-12" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          : statCards.map((stat) => (
              <Card key={stat.title} className="py-0 gap-0">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center size-10 rounded-lg ${stat.iconBg}`}>
                      <stat.icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{stat.title}</p>
                      <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* API Connector Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">API Connector Status</CardTitle>
            <CardDescription>Performance and reliability metrics</CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted/50 rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground mb-1">Total Requests</p>
                    <p className="text-xl font-bold">{stats?.apiStats?.total ?? 0}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground mb-1">Avg Response Time</p>
                    <p className="text-xl font-bold">{stats?.apiStats?.avgDuration ?? 0}ms</p>
                  </div>
                </div>
                
                <div className="space-y-3 mt-2">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-emerald-500" /> Passed</span>
                      <span className="font-medium">{stats?.apiStats?.passed ?? 0}</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full" 
                        style={{ width: `${stats?.apiStats?.total ? ((stats.apiStats.passed / stats.apiStats.total) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-red-500" /> Failed</span>
                      <span className="font-medium">{stats?.apiStats?.failed ?? 0}</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-red-500 rounded-full" 
                        style={{ width: `${stats?.apiStats?.total ? ((stats.apiStats.failed / stats.apiStats.total) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest platform events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {recentActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
              ) : null}
              {recentActivities.map((activity) => {
                const Icon = activityIcons[activity.type]
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="mt-0.5">
                      <Icon className={`size-4 ${activityColors[activity.status]}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-tight">{activity.message}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="size-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                          {formatDistanceToNow(new Date(activity.timestamp), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connection Health Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Connection Health</CardTitle>
              <CardDescription>FileMaker connection statuses</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <Link href="/connections">View All</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!connections || connections.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="size-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No connections configured yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setShowConnectionDialog(true, null)
                }}
              >
                <Plus className="size-4 mr-1" />
                Add Connection
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {connections.slice(0, 5).map((conn) => {
                const config = statusConfig[conn.status as keyof typeof statusConfig] || statusConfig.disconnected
                const StatusIcon = config.icon
                return (
                  <div
                    key={conn.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <StatusIcon className={`size-4 shrink-0 ${config.color}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{conn.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {conn.database} @ {conn.host}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {conn.lastTested && (
                        <span className="text-xs text-muted-foreground hidden sm:inline" suppressHydrationWarning>
                          {formatDistanceToNow(new Date(conn.lastTested), {
                            addSuffix: true,
                          })}
                        </span>
                      )}
                      <Badge variant="outline" className={`text-[10px] ${config.badge}`}>
                        {conn.status}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

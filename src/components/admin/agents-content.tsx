'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AgentFormDialog } from '@/components/admin/agent-form-dialog'
import { format } from 'date-fns'
import { Plus, Pencil } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { QueryError } from '@/components/ui/query-error'
import type { Profile } from '@/lib/supabase/types'

const supabase = createClient()

export function AgentsContent() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editAgent, setEditAgent] = useState<Profile | null>(null)
  const isInitialized = useAuthStore((s) => s.isInitialized)

  const { data: agents, isLoading, isError, refetch } = useQuery({
    queryKey: ['agents'],
    enabled: isInitialized,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Profile[]
    },
  })

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gestión de agentes</h1>
        <Button
          onClick={() => {
            setEditAgent(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Crear agente
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={5}>
                  <QueryError onRetry={refetch} />
                </TableCell>
              </TableRow>
            )}
            {agents?.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell className="font-medium">
                  {agent.full_name}
                </TableCell>
                <TableCell>{agent.email}</TableCell>
                <TableCell>
                  <Badge
                    variant={agent.role === 'admin' ? 'default' : 'secondary'}
                  >
                    {agent.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  {format(new Date(agent.created_at), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditAgent(agent)
                      setDialogOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AgentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editAgent={editAgent}
      />
    </>
  )
}

import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: conversations } = await supabase
    .from('conversations')
    .select('*')
    .contains('participant_ids', [user!.id])
    .order('last_message_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Messages</h1>
        <p className="text-muted-foreground mt-1">Your conversations with landlords and tenants</p>
      </div>

      {!conversations || conversations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <h3 className="text-lg font-semibold">No messages yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              When you connect with landlords or tenants, your conversations will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {conversations.map((conversation) => (
            <Card key={conversation.id} className="cursor-pointer hover:bg-accent/50 transition-colors">
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1">
                  <p className="font-medium text-sm">Conversation</p>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {conversation.last_message_preview || 'No messages yet'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

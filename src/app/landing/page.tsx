import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MessageSquare, Zap, Shield, Clock } from 'lucide-react'

export default function LandingPage() {
  const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'tu_bot'

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-card to-background">
      <div className="pointer-events-none absolute -left-40 top-20 h-[500px] w-[500px] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-20 h-[400px] w-[400px] rounded-full bg-primary/8 blur-3xl" />

      {/* Hero */}
      <div className="relative mx-auto max-w-4xl px-4 py-20 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <MessageSquare className="h-8 w-8" />
        </div>
        <h1 className="mb-4 text-5xl font-semibold tracking-tight">
          Atencion al cliente
          <span className="text-primary"> instantanea</span>
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
          Conectate con nuestro equipo de soporte directamente desde Telegram.
          Respuestas rapidas, atencion personalizada.
        </p>
        <a
          href={`https://t.me/${BOT_USERNAME}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button size="lg" className="shadow-lg shadow-primary/25">
            <MessageSquare className="mr-2 h-5 w-5" />
            Iniciar chat en Telegram
          </Button>
        </a>
      </div>

      {/* Features */}
      <div className="relative mx-auto max-w-4xl px-4 pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-0 bg-card/80 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="pt-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-status-info-bg text-status-info-icon">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-semibold">Respuesta rapida</h3>
              <p className="text-sm text-muted-foreground">
                Nuestro equipo responde en minutos, no en horas.
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 bg-card/80 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="pt-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-status-success-bg text-status-success-icon">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-semibold">Seguro</h3>
              <p className="text-sm text-muted-foreground">
                Tus datos estan protegidos en todo momento.
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 bg-card/80 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="pt-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-primary">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="mb-2 font-semibold">Disponible 24/7</h3>
              <p className="text-sm text-muted-foreground">
                Atencion disponible las 24 horas, los 7 dias.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

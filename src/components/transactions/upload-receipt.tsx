'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Upload, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'

interface UploadReceiptProps {
  onUploaded: (url: string) => void
}

export function UploadReceipt({ onUploaded }: UploadReceiptProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const supabase = createClient()
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `receipts/${Date.now()}.${ext}`

    const { data, error } = await supabase.storage
      .from('chat-attachments')
      .upload(path, file)

    if (error) {
      toast.error('Error al subir comprobante')
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('chat-attachments')
      .getPublicUrl(data.path)

    onUploaded(urlData.publicUrl)
    setUploading(false)
    setUploaded(true)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf"
        onChange={handleUpload}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : uploaded ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {uploaded ? 'Comprobante subido' : 'Subir comprobante'}
      </Button>
    </div>
  )
}

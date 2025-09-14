"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, X, Trash2 } from "lucide-react"
import { useAuth } from "@/components/auth-provider"

interface Sticker {
  id: string
  name: string
  url: string
  file_type: string
  uploaded_by: string
  created_at: string
}

interface StickerPanelProps {
  onStickerSelect: (url: string) => void
  onClose: () => void
}

export function StickerPanel({ onStickerSelect, onClose }: StickerPanelProps) {
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const { userData } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    fetchStickers()

    const channel = supabase
      .channel("stickers")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stickers",
        },
        (payload) => {
          console.log("[v0] New sticker uploaded:", payload)
          setStickers((prev) => [payload.new as Sticker, ...prev])
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "stickers",
        },
        (payload) => {
          console.log("[v0] Sticker deleted:", payload)
          setStickers((prev) => prev.filter((sticker) => sticker.id !== payload.old.id))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  const fetchStickers = async () => {
    const { data, error } = await supabase.from("stickers").select("*").order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching stickers:", error)
      return
    }

    setStickers(data || [])
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Check file type
    const allowedTypes = ["image/gif", "image/png", "image/jpg", "image/jpeg", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      alert("Please upload a GIF, PNG, JPG, JPEG, or WebP file")
      return
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB")
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      // Upload to Supabase Storage
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`
      console.log("[v0] Uploading file:", fileName)

      const { data: uploadData, error: uploadError } = await supabase.storage.from("stickers").upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      })

      if (uploadError) throw uploadError

      setUploadProgress(50)

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("stickers").getPublicUrl(fileName)

      console.log("[v0] File uploaded, public URL:", publicUrl)
      setUploadProgress(75)

      // Save to database
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error("User not authenticated")

      const { error: dbError } = await supabase.from("stickers").insert({
        name: file.name,
        url: publicUrl,
        file_type: file.type.split("/")[1],
        uploaded_by: user.id,
      })

      if (dbError) throw dbError

      setUploadProgress(100)
      console.log("[v0] Sticker saved to database successfully")

      // Reset file input
      event.target.value = ""
    } catch (error) {
      console.error("[v0] Error uploading sticker:", error)
      alert("Failed to upload sticker. Please try again.")
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  

  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">Stickers & GIFs</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="browse" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="browse">Browse ({stickers.length})</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4">
          <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            {stickers.map((sticker) => (
              <div key={sticker.id} className="relative group">
                <button
                  onClick={() => onStickerSelect(sticker.url)}
                  className="aspect-square rounded-lg overflow-hidden border border-border hover:border-primary transition-colors w-full"
                >
                  <img
                    src={sticker.url || "/placeholder.svg"}
                    alt={sticker.name}
                    className="w-full h-full object-cover"
                  />
                </button>
                
              </div>
            ))}
          </div>
          {stickers.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">No stickers uploaded yet</p>
          )}
        </TabsContent>

        <TabsContent value="upload" className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">Upload GIFs, PNGs, or other images (max 5MB)</p>
            <Input
              type="file"
              accept="image/gif,image/png,image/jpg,image/jpeg,image/webp"
              onChange={handleFileUpload}
              disabled={isUploading}
              className="cursor-pointer"
            />
            {isUploading && (
              <div className="mt-4">
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground mt-2">Uploading... {uploadProgress}%</p>
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Supported formats: GIF, PNG, JPG, JPEG, WebP</p>
            <p>• Maximum file size: 5MB</p>
            <p>• Files are stored securely and can be deleted by you or admins</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

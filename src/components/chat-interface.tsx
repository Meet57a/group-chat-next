"use client"
import { useState, useEffect, useRef } from "react"
import type React from "react"

import { createClient } from "@/lib/client"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Bell, BellOff, Send, Smile, Settings, LogOut, Users, X, UserX, Menu } from "lucide-react"
import { StickerPanel } from "@/components/sticker-panel"
import { ThemeToggle } from "@/components/theme-toggle"

interface Message {
  id: string
  content: string | null
  message_type: "text" | "sticker" | "gif"
  media_url: string | null
  user_id: string
  created_at: string
  users: {
    display_name: string
    avatar_url: string | null
  }
}

interface OnlineUser {
  id: string
  display_name: string
  avatar_url: string | null
  role: string
  last_seen: string
}

interface ChatInterfaceProps {
  user: {
    id: string
    display_name: string
    role: string
    avatar_url: string | null
  }
}

export function ChatInterface({ user }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showStickerPanel, setShowStickerPanel] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default")
  const [showOnlineUsers, setShowOnlineUsers] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [createUserForm, setCreateUserForm] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "user",
  })
  const [createUserLoading, setCreateUserLoading] = useState(false)
  const [createUserError, setCreateUserError] = useState<string | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [allUsers, setAllUsers] = useState<OnlineUser[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { signOut } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [sideBarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission)
      setNotificationsEnabled(Notification.permission === "granted")
    }

    updateLastSeen()
    const interval = setInterval(updateLastSeen, 30000)

    return () => clearInterval(interval)
  }, [])

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
      setNotificationsEnabled(permission === "granted")
    }
  }

  const showNotification = (message: Message) => {
    
    if (notificationsEnabled && message.user_id !== user.id) {
      const notification = new Notification(`New message from ${message.users.display_name}`, {
        body: message.content || "Sent a sticker",
        icon: message.users.avatar_url || "/placeholder.svg?height=64&width=64",
        tag: "chat-message",
      })

      setTimeout(() => notification.close(), 5000)

      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(`
          *,
          users (
            display_name,
            avatar_url
          )
        `)
        .order("created_at", { ascending: true })
        .limit(50)

      if (error) {
        console.error("Error loading messages:", error)
      } else {
        setMessages(data || [])
      }
    }

    loadMessages()
  }, [supabase])

  useEffect(() => {
    const channel = supabase
      .channel("messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload: { new: { id: string } }) => {
          console.log("[v0] New message received:", payload)

          const { data: newMessage, error } = await supabase
            .from("messages")
            .select(`
              *,
              users (
                display_name,
                avatar_url
              )
            `)
            .eq("id", payload.new.id)
            .single()

          if (error) {
            console.error("Error fetching new message:", error)
          } else if (newMessage) {
            setMessages((prev) => [...prev, newMessage])
            showNotification(newMessage)
          }
        },
      )
      .subscribe((status: string) => {
        console.log("[v0] Subscription status:", status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, user.id, notificationsEnabled])

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || isLoading) return

    setIsLoading(true)
    try {
      const { error } = await supabase.from("messages").insert({
        content: newMessage.trim(),
        message_type: "text",
        user_id: user.id,
      })

      if (error) throw error
      setNewMessage("")
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStickerSelect = async (stickerUrl: string) => {
    setIsLoading(true)
    try {
      const { error } = await supabase.from("messages").insert({
        content: null,
        message_type: "sticker",
        media_url: stickerUrl,
        user_id: user.id,
      })

      if (error) throw error
      setShowStickerPanel(false)
    } catch (error) {
      console.error("Error sending sticker:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    router.push("/auth/login")
  }

  const loadOnlineUsers = async () => {
    const { data, error } = await supabase
      .from("users")
      .select("id, display_name, avatar_url, role, last_seen")
      .order("last_seen", { ascending: false })

    if (error) {
      console.error("Error loading users:", error)
    } else {
      setOnlineUsers(data || [])
      setAllUsers(data || [])
    }
  }

  const deleteUser = async (userId: string) => {
    if (user.role !== "admin" || userId === user.id) return

    const { error } = await supabase.from("users").delete().eq("id", userId)

    if (error) {
      console.error("Error deleting user:", error)
    } else {
      loadOnlineUsers()
    }
  }

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (user.role !== "admin") return

    setCreateUserLoading(true)
    setCreateUserError(null)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: createUserForm.email,
        password: createUserForm.password,
        options: {
          data: {
            display_name: createUserForm.displayName,
            role: createUserForm.role,
          },
        },
      })

      if (error) throw error

      // Reset form and close modal
      setCreateUserForm({ email: "", password: "", displayName: "", role: "user" })
      setShowCreateUser(false)
      loadOnlineUsers() // Refresh user list
    } catch (error: unknown) {
      setCreateUserError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setCreateUserLoading(false)
    }
  }

  const updateLastSeen = async () => {
    await supabase.from("users").update({ last_seen: new Date().toISOString() }).eq("id", user.id)
  }

  return (
    <div className="flex h-screen bg-background">

      {
        sideBarOpen && <div className="w-80 border-r bg-card flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-semibold">Group Chat</h1>
              <ThemeToggle />
            </div>

            <div className="flex items-center gap-3 mb-4">
              <Avatar>
                <AvatarImage src={user.avatar_url || undefined} />
                <AvatarFallback>{user.display_name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium">{user.display_name}</p>
                <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role}</Badge>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">Notifications</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!notificationsEnabled) requestNotificationPermission();
                }}
                disabled={notificationPermission === "granted"}
              >
                {notificationsEnabled ? <Bell className="h-4 w-4 text-green-500" /> : <BellOff className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="p-4 space-y-2">



            {user.role === "admin" && (
              <Button
                variant="outline"
                className="w-full justify-start bg-transparent"
                onClick={() => {
                  setShowAdminPanel(true)

                }}
              >
                <Settings className="h-4 w-4 mr-2" />
                Admin Panel
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full justify-start text-red-600 hover:text-red-700 bg-transparent"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      }

      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.user_id === user.id ? "justify-end" : "justify-start"}`}
            >
              {message.user_id !== user.id && (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={message.users.avatar_url || undefined} />
                  <AvatarFallback>{message.users.display_name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              )}

              <div className={`max-w-xs lg:max-w-md ${message.user_id === user.id ? "order-first" : ""}`}>
                <p className="text-xs text-muted-foreground mb-1 text-right">{message.users.display_name}</p>

                <Card
                  className={`p-3 ${message.user_id === user.id ? "bg-accent text-black ml-auto" : "bg-accent"
                    } dark:text-white`}
                >
                  {message.message_type === "text" ? (
                    <p className="text-sm">{message.content}</p>
                  ) : (
                    <img src={message.media_url || ""} alt="Sticker" className="w-40 h-40  object-contain" />
                  )}
                </Card>

                <p className="text-xs text-muted-foreground text-right">
                  {new Date(message.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {showStickerPanel && (
          <div className="border-t">
            <StickerPanel onStickerSelect={handleStickerSelect} onClose={() => setShowStickerPanel(false)} />
          </div>
        )}

        <div className="border-t p-4">
          <form onSubmit={sendMessage} className="flex gap-2">
            <Button
            
              className=" "
              onClick={() => setSidebarOpen(!sideBarOpen)}
            >
              <Menu className="h-6 w-6" />
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={() => setShowStickerPanel(!showStickerPanel)}>
              <Smile className="h-4 w-4" />
            </Button>

            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              disabled={isLoading}
              className="flex-1"
            />

            <Button type="submit" disabled={isLoading || !newMessage.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>

      {showOnlineUsers && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-96 max-h-96 overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Online Users ({onlineUsers.length})</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowOnlineUsers(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto space-y-3">
              {onlineUsers.map((onlineUser) => (
                <div key={onlineUser.id} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={onlineUser.avatar_url || undefined} />
                    <AvatarFallback>{onlineUser.display_name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{onlineUser.display_name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={onlineUser.role === "admin" ? "default" : "secondary"} className="text-xs">
                        {onlineUser.role}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(onlineUser.last_seen).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`w-2 h-2 rounded-full ${new Date().getTime() - new Date(onlineUser.last_seen).getTime() < 60000
                      ? "bg-green-500"
                      : "bg-gray-400"
                      }`}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {showAdminPanel && user.role === "admin" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-96 max-h-96 overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Admin Panel</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowAdminPanel(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto space-y-3">
              <Button size="sm" onClick={() => setShowCreateUser(true)} className="text-xs">
                Add User
              </Button>

            </div>
          </Card>
        </div>
      )}

      {showCreateUser && user.role === "admin" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-96">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Create New User</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreateUser(false)
                  setCreateUserError(null)
                  setCreateUserForm({ email: "", password: "", displayName: "", role: "user" })
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4">
              <form onSubmit={createUser} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    value={createUserForm.email}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="user@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Display Name</label>
                  <Input
                    type="text"
                    value={createUserForm.displayName}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, displayName: e.target.value }))}
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    value={createUserForm.password}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Password"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Role</label>
                  <select
                    value={createUserForm.role}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, role: e.target.value }))}
                    className="w-full p-2 border rounded-md bg-background"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {createUserError && <p className="text-sm text-red-500">{createUserError}</p>}
                <div className="flex gap-2">
                  <Button type="submit" disabled={createUserLoading} className="flex-1">
                    {createUserLoading ? "Creating..." : "Create User"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateUser(false)
                      setCreateUserError(null)
                      setCreateUserForm({ email: "", password: "", displayName: "", role: "user" })
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

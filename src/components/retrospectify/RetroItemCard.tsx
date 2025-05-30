

import type { RetroItem, User, Category } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState, type FormEvent, type DragEvent, useEffect } from 'react';
import { MessageSquare, Trash2, Edit, Save, X } from 'lucide-react'; 
import { formatDistanceToNow, parseISO } from 'date-fns';
import { cn, getGravatarUrl } from '@/lib/utils'; 
import type { Timestamp as FBTimestamp } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as React from 'react';


interface RetroItemCardProps {
  item: RetroItem;
  currentUser: User;
  onAddReply: (itemId: string, replyContent: string) => void;
  onEditItem?: (itemId: string, newContent: string) => void; 
  onDeleteItem?: (itemId: string) => void; 
  onEditReply?: (itemId: string, replyId: string, newContent: string) => void;
  onDeleteReply?: (itemId: string, replyId: string) => void;
  onDragStartItem: (itemId: string, originalCategory: Category) => void; 
  onDragEndItem: () => void; 
  isDragging?: boolean; 
}

export function RetroItemCard({
    item,
    currentUser,
    onAddReply,
    onEditItem, 
    onDeleteItem,
    onEditReply,
    onDeleteReply,
    onDragStartItem,
    onDragEndItem,
    isDragging
}: RetroItemCardProps) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isEditingContent, setIsEditingContent] = useState(false); 
  const [editedContent, setEditedContent] = useState(item.content); 

  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editedReplyContent, setEditedReplyContent] = useState('');

  useEffect(() => {
    setEditedContent(item.content);
    if (isEditingContent && item.editing === false) { 
        setIsEditingContent(false);
    }
  }, [item.content, item.editing, isEditingContent]);

  const handleReplySubmit = (e: FormEvent) => {
    e.preventDefault();
    if (replyContent.trim()) {
      onAddReply(item.id, replyContent);
      setReplyContent('');
      setShowReplyInput(false);
    }
  };

  const handleEditClick = () => {
    setEditedContent(item.content); 
    setIsEditingContent(true);
  };

  const handleSaveEdit = () => {
    if (editedContent.trim() && editedContent !== item.content && onEditItem) {
      onEditItem(item.id, editedContent);
    }
    setIsEditingContent(false);
  };

  const handleCancelEdit = () => {
    setIsEditingContent(false);
    setEditedContent(item.content); 
  };

  const handleEditReplyClick = (reply: RetroItem) => {
    setEditingReplyId(reply.id);
    setEditedReplyContent(reply.content);
  };

  const handleSaveEditReply = (replyId: string) => {
    if (editedReplyContent.trim() && onEditReply) {
      onEditReply(item.id, replyId, editedReplyContent);
    }
    setEditingReplyId(null);
    setEditedReplyContent('');
  };

  const handleCancelEditReply = () => {
    setEditingReplyId(null);
    setEditedReplyContent('');
  };


  const isAdmin = currentUser.role === 'admin';
  const isAuthor = item.author.id === currentUser.id;

  const canModify = isAuthor || isAdmin;
  const canDelete = onDeleteItem && canModify;
  const canEdit = onEditItem && canModify;

   const allowReply = !(
    (isAuthor && !item.isFromPoll && (item.category === 'well' || item.category === 'improve')) ||
    item.category === 'action' ||
    (item.isFromPoll && !isAuthor)
  );


  const isDraggable = isAuthor || isAdmin;

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
     if (!isDraggable) {
       console.log("Drag prevented: Not owner/admin or not draggable item type.");
       e.preventDefault();
       return;
     }
    e.dataTransfer.setData('text/plain', item.id); 
    e.dataTransfer.setData('application/json', JSON.stringify({ id: item.id, originalCategory: item.category })); 
    e.dataTransfer.effectAllowed = "move";

    if (typeof onDragStartItem === 'function') {
      onDragStartItem(item.id, item.category); 
    } else {
      console.error("onDragStartItem is not a function in RetroItemCard");
    }
  };

   const handleDragEnd = (e: DragEvent<HTMLDivElement>) => {
      if (!isDraggable) return;

      if (typeof onDragEndItem === 'function') {
        onDragEndItem(); 
      } else {
         console.error("onDragEndItem is not a function in RetroItemCard");
      }
   };

   const itemAuthorAvatarUrl = item.author.avatarUrl || getGravatarUrl(item.author.email, 80)!;
   const currentUserAvatarUrl = currentUser.avatarUrl || getGravatarUrl(currentUser.email, 80)!;

    const getFormattedTimestamp = (timestamp: FBTimestamp | Date | string): string => {
        if (!timestamp) return 'just now'; 
        let dateToFormat: Date;

        if (timestamp instanceof Date) {
            dateToFormat = timestamp;
        } else if (typeof timestamp === 'string') {
            dateToFormat = parseISO(timestamp); 
        } else if (timestamp && typeof (timestamp as FBTimestamp).toDate === 'function') {
            dateToFormat = (timestamp as FBTimestamp).toDate();
        } else {
            console.warn("Invalid timestamp format in RetroItemCard:", timestamp);
            return 'unknown time'; 
        }
        try {
            return formatDistanceToNow(dateToFormat, { addSuffix: true });
        } catch (error) {
            console.error("Error formatting date in RetroItemCard:", error, "Date to format:", dateToFormat);
            return 'unknown time';
        }
    };



  return (
    <Card
       className={cn(
         "mb-4 shadow-sm transition-colors duration-150 ease-in-out", 
         isDraggable && "cursor-grab",
         !isDraggable && "cursor-default",
         isDragging && "opacity-50 ring-2 ring-primary ring-offset-2 scale-105 z-10", 
         isEditingContent && "ring-2 ring-amber-400 ring-offset-1" 
       )}
       draggable={isDraggable && !isEditingContent} 
       onDragStart={handleDragStart}
       onDragEnd={handleDragEnd}
       data-item-id={item.id}
    >
      <CardHeader className="flex flex-row items-start justify-between space-x-2 space-y-0 pb-2 pt-4 px-4">
        <div className="flex items-center space-x-3 flex-grow overflow-hidden">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={itemAuthorAvatarUrl} alt={item.author.name} data-ai-hint="avatar profile picture" />
            <AvatarFallback>{item.author.name.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="overflow-hidden">
            <p className="text-sm font-medium leading-none truncate">{item.author.name}</p>
            <p className="text-xs text-muted-foreground">
              {getFormattedTimestamp(item.timestamp)}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center space-x-1">
             {!isEditingContent && canEdit && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={handleEditClick}>
                <Edit className="h-4 w-4" />
                <span className="sr-only">Edit item</span>
              </Button>
             )}
             {!isEditingContent && canDelete && (
               <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDeleteItem && onDeleteItem(item.id)}>
                 <Trash2 className="h-4 w-4" />
                 <span className="sr-only">Delete item</span>
               </Button>
             )}
        </div>
      </CardHeader>

      <CardContent className="pb-3 pt-0 px-4">
         {isEditingContent ? (
            <div className="space-y-2">
                 <Textarea
                   value={editedContent}
                   onChange={(e) => setEditedContent(e.target.value)}
                   className="min-h-[60px] text-sm bg-background/90 focus:bg-background"
                   autoFocus
                   onKeyDown={(e) => {
                       if (e.key === 'Enter' && !e.shiftKey) {
                           e.preventDefault(); 
                           handleSaveEdit();
                       }
                       if (e.key === 'Escape') {
                           handleCancelEdit();
                       }
                   }}
                 />
                 <div className="flex justify-end space-x-2">
                    <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                        <X className="h-4 w-4 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveEdit} disabled={!editedContent.trim() || editedContent === item.content}>
                       <Save className="h-4 w-4 mr-1" /> Save
                    </Button>
                 </div>
            </div>
         ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
              {item.isFromPoll && (
                  <p className="text-xs text-muted-foreground/70 italic mt-1">(From sentiment poll)</p>
              )}
            </div>
         )}
      </CardContent>

       {!isEditingContent && (
          <>
             {allowReply && (
                <CardFooter className="flex justify-end pt-0 pb-3 px-4">
                <Button variant="ghost" size="sm" onClick={() => setShowReplyInput(!showReplyInput)}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Reply ({item.replies?.length ?? 0})
                </Button>
                </CardFooter>
             )}
             {showReplyInput && allowReply && (
                 <CardFooter className="flex flex-col items-start space-y-2 pt-0 pb-4 px-4">
                    {item.replies && item.replies.length > 0 && (
                        <div className="w-full space-y-2 pl-6 border-l ml-4 mb-2">
                        {item.replies.map((reply, index) => {
                            const replyAuthorAvatarUrl = reply.author.avatarUrl || getGravatarUrl(reply.author.email, 60)!;
                            const isReplyAuthor = reply.author.id === currentUser.id;
                            const isLastReply = index === (item.replies?.length ?? 0) - 1;
                            const canModifyReply = isReplyAuthor && isLastReply && (onEditReply || onDeleteReply);

                            return (
                                <div key={reply.id} className="flex items-start space-x-2 text-xs group">
                                    <Avatar className="h-6 w-6 flex-shrink-0 mt-0.5">
                                        <AvatarImage src={replyAuthorAvatarUrl} alt={reply.author.name} data-ai-hint="avatar profile picture" />
                                        <AvatarFallback>{reply.author.name.charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-grow">
                                        {editingReplyId === reply.id && onEditReply ? (
                                            <div className="space-y-1 mt-1">
                                                <Textarea
                                                    value={editedReplyContent}
                                                    onChange={(e) => setEditedReplyContent(e.target.value)}
                                                    className="min-h-[30px] text-xs"
                                                    rows={1}
                                                    autoFocus
                                                />
                                                <div className="flex justify-end space-x-1">
                                                    <Button variant="ghost" size="xs" onClick={handleCancelEditReply}>Cancel</Button>
                                                    <Button size="xs" onClick={() => handleSaveEditReply(reply.id)} disabled={!editedReplyContent.trim()}>Save</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="prose prose-xs dark:prose-invert max-w-none break-words">
                                                <span className="font-medium">{reply.author.name}: </span>
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: React.Fragment }}>{reply.content}</ReactMarkdown>
                                                <p className="text-muted-foreground text-[10px] not-prose">
                                                  {getFormattedTimestamp(reply.timestamp)}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    {canModifyReply && editingReplyId !== reply.id && (
                                        <div className="flex-shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            {onEditReply && (
                                                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-primary" onClick={() => handleEditReplyClick(reply)}>
                                                    <Edit className="h-3 w-3" />
                                                </Button>
                                            )}
                                            {onDeleteReply && (
                                                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive" onClick={() => onDeleteReply(item.id, reply.id)}>
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        </div>
                    )}
                    <form onSubmit={handleReplySubmit} className="w-full flex space-x-2 items-start pt-2">
                        <Avatar className="h-8 w-8 mt-1 flex-shrink-0">
                        <AvatarImage src={currentUserAvatarUrl} alt={currentUser.name} data-ai-hint="avatar profile picture" />
                        <AvatarFallback>{currentUser.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-grow space-y-1">
                            <Textarea
                                placeholder="Write a reply..."
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                className="min-h-[40px] text-sm"
                                rows={1} 
                            />
                            <div className="flex justify-end">
                                <Button type="submit" size="sm" disabled={!replyContent.trim()}>
                                    Send Reply
                                </Button>
                            </div>
                        </div>
                    </form>
                </CardFooter>
             )}
             {!showReplyInput && allowReply && item.replies && item.replies.length > 0 && (
                 <CardFooter className="flex flex-col items-start space-y-2 pt-0 pb-4 px-4">
                    <div className="w-full space-y-2 pl-6 border-l ml-4">
                        {item.replies.map((reply, index) => {
                            const replyAuthorAvatarUrl = reply.author.avatarUrl || getGravatarUrl(reply.author.email, 60)!;
                            const isReplyAuthor = reply.author.id === currentUser.id;
                            const isLastReply = index === (item.replies?.length ?? 0) - 1;
                            const canModifyReply = isReplyAuthor && isLastReply && (onEditReply || onDeleteReply);

                            return (
                                <div key={reply.id} className="flex items-start space-x-2 text-xs group">
                                    <Avatar className="h-6 w-6 flex-shrink-0 mt-0.5">
                                        <AvatarImage src={replyAuthorAvatarUrl} alt={reply.author.name} data-ai-hint="avatar profile picture" />
                                        <AvatarFallback>{reply.author.name.charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                     <div className="flex-grow">
                                        {editingReplyId === reply.id && onEditReply ? (
                                            <div className="space-y-1 mt-1">
                                                <Textarea
                                                    value={editedReplyContent}
                                                    onChange={(e) => setEditedReplyContent(e.target.value)}
                                                    className="min-h-[30px] text-xs"
                                                    rows={1}
                                                    autoFocus
                                                />
                                                <div className="flex justify-end space-x-1">
                                                    <Button variant="ghost" size="xs" onClick={handleCancelEditReply}>Cancel</Button>
                                                    <Button size="xs" onClick={() => handleSaveEditReply(reply.id)} disabled={!editedReplyContent.trim()}>Save</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="prose prose-xs dark:prose-invert max-w-none break-words">
                                                <span className="font-medium">{reply.author.name}: </span>
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: React.Fragment }}>{reply.content}</ReactMarkdown>
                                                <p className="text-muted-foreground text-[10px] not-prose">
                                                  {getFormattedTimestamp(reply.timestamp)}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    {canModifyReply && editingReplyId !== reply.id && (
                                        <div className="flex-shrink-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            {onEditReply && (
                                                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-primary" onClick={() => handleEditReplyClick(reply)}>
                                                    <Edit className="h-3 w-3" />
                                                </Button>
                                            )}
                                            {onDeleteReply && (
                                                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive" onClick={() => onDeleteReply(item.id, reply.id)}>
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </CardFooter>
             )}
          </>
       )}
    </Card>
  );
}


import React from 'react';
import {ArrowLeft, Menu, ChevronDown, ChevronRight, X, Check, EyeOff, RefreshCw, Save, Search, Send, Share2, Mail, Plus, Inbox, Unlink, Trash2, Folder, FileText, Link2, Zap, Layers, Camera, Calendar, ChevronLeft, Minus, PlusCircle, Circle} from 'lucide-react';
const icons = {ArrowLeft, Menu, ChevronDown, ChevronRight, X, Check, EyeOff, RefreshCw, Save, Search, Send, Share2, Mail, Plus, Inbox, Unlink, Trash2, Folder, FileText, Link2, Zap, Layers, Camera, Calendar, ChevronLeft, Minus, PlusCircle};
export default function Feather({name, size = 20, color = 'currentColor', style}) {
 const key = name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
 const Icon = icons[key] || Circle;
 return <Icon size={size} color={color} style={Array.isArray(style) ? Object.assign({}, ...style) : style} aria-hidden="true" />;
}

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
    Save,
    Check,
    Loader2,
    Image as ImageIcon,
    MapPin,
    Plus,
    Trash2,
    Phone,
    Clock,
    Bike,
    ChevronDown,
    Camera,
    Store,
    Truck,
    Map as MapIcon,
    Upload,
    Share2,
    ExternalLink,
    Globe,
    Zap,
    Hotel,
    Building2,
    ChevronRight,
    Search,
    ChevronUp,
    CreditCard,
    ShieldCheck,
    ShieldAlert,
    ShieldX,
    Lock,
    ToggleLeft,
    ToggleRight,
    Sparkles,
    CheckCircle2,
    AlertTriangle,
    AlertCircle
} from 'lucide-react';
import VerificationModal from '../components/VerificationModal';
import { useAuth } from '../../context/AuthContext';
import AddressPicker from '../../components/AddressPicker';
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../../lib/venezuelaData';
import { supabase } from '../../lib/supabase';
import { GLOBAL_CATEGORIES, CATEGORY_SECTORS } from '../../lib/constants';

const getCategoryEmoji = (name: string): string => {
    if (!name) return '🏪';
    const lower = name.toLowerCase();
    if (lower.includes('restaurante') || lower.includes('comida')) return '🍽️';
    if (lower.includes('panader')) return '🥖';
    if (lower.includes('supermercado') || lower.includes('viveres') || lower.includes('víveres')) return '🛒';
    if (lower.includes('ferreter')) return '🔧';
    if (lower.includes('motorepuesto') || lower.includes('moto')) return '🏍️';
    if (lower.includes('autoparte') || lower.includes('carro') || lower.includes('vehiculo')) return '🚗';
    if (lower.includes('concesionario')) return '🚙';
    if (lower.includes('farmacia') || lower.includes('salud') || lower.includes('medic')) return '💊';
    if (lower.includes('licor') || lower.includes('bebida') || lower.includes('cerveza')) return '🍷';
    if (lower.includes('tecnolog') || lower.includes('celular') || lower.includes('comput')) return '📱';
    if (lower.includes('hogar') || lower.includes('mueble')) return '🛋️';
    if (lower.includes('moda') || lower.includes('ropa') || lower.includes('calzado')) return '👗';
    if (lower.includes('belleza') || lower.includes('estetica') || lower.includes('estética') || lower.includes('barber')) return '💇';
    if (lower.includes('mascota') || lower.includes('veterinaria')) return '🐾';
    if (lower.includes('papeler') || lower.includes('librer')) return '📚';
    if (lower.includes('hotel') || lower.includes('posada') || lower.includes('hospedaje')) return '🏨';
    if (lower.includes('servicio') || lower.includes('taller')) return '⚙️';
    return '🏪';
};

interface Location {
    address: string;
    city: string;
    state: string;
    coords?: { lat: number; lng: number };
    type: 'principal' | 'sucursal';
    reference?: string;
}

interface DeliveryRate {
    minKm: number;
    maxKm: number;
    price: number;
}

interface WorkingHour {
    day: string;
    open: string;
    close: string;
    closed: boolean;
}

interface SocialLink {
    id: string; // The ID of the global icon
    name: string; // The name of the social network
    url: string; // The user's profile URL
    imageUrl: string; // The icon image URL
}

interface PaymentMethod {
    type: 'Pago Móvil' | 'Zelle' | 'Transferencia' | 'Efectivo' | 'Otro';
    bank?: string;
    rif?: string;
    phone?: string;
    owner?: string;
    email?: string;
    note?: string;
}

const DEFAULT_WORKING_HOURS: WorkingHour[] = [
    { day: 'Lunes', open: '08:00', close: '22:00', closed: false },
    { day: 'Martes', open: '08:00', close: '22:00', closed: false },
    { day: 'Miércoles', open: '08:00', close: '22:00', closed: false },
    { day: 'Jueves', open: '08:00', close: '22:00', closed: false },
    { day: 'Viernes', open: '08:00', close: '22:00', closed: false },
    { day: 'Sábado', open: '08:00', close: '22:00', closed: false },
    { day: 'Domingo', open: '08:00', close: '22:00', closed: false },
];

export default function RestaurantProfile() {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    const rid = userData?.managedRestaurantId || user?.uid;
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Form states
    const [name, setName] = useState('');
    const [rifPrefix, setRifPrefix] = useState<'J' | 'V' | 'G' | 'E' | 'C'>('J');
    const [rifNumber, setRifNumber] = useState('');
    const [companyType, setCompanyType] = useState('CA');
    const [whatsappNumber, setWhatsappNumber] = useState('');
    const [isBusinessTypeOpen, setIsBusinessTypeOpen] = useState(false);
    const [businessTypeSearch, setBusinessTypeSearch] = useState('');
    const [ownDelivery, setOwnDelivery] = useState(false);
    const [appDelivery, setAppDelivery] = useState(false);
    const [pickupOnly, setPickupOnly] = useState(false);
    const [deliveryTime, setDeliveryTime] = useState('20-40 min');
    const [logoUrl, setLogoUrl] = useState('');
    const [coverUrl, setCoverUrl] = useState('');
    const [location, setLocation] = useState<Location | null>(null);
    const [deliveryRates, setDeliveryRates] = useState<DeliveryRate[]>([]);
    const [workingHours, setWorkingHours] = useState<WorkingHour[]>(DEFAULT_WORKING_HOURS);
    const [followerCount, setFollowerCount] = useState(0);
    const [followers, setFollowers] = useState<any[]>([]);

    // UI states for image uploads
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [showPicker, setShowPicker] = useState<number | null>(null);

    // Social Media states
    const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
    const [globalIcons, setGlobalIcons] = useState<any[]>([]);
    const [isSocialAdding, setIsSocialAdding] = useState(false);

    // Categories
    const [categoryId, setCategoryId] = useState('');
    const [subCategoryId, setSubCategoryId] = useState('');
    const [globalCategories, setGlobalCategories] = useState<any[]>([]);
    const [hasCashea, setHasCashea] = useState(false);
    const [casheaIcon, setCasheaIcon] = useState<string | null>(null);
    const [casheaQrUrl, setCasheaQrUrl] = useState('');
    const [casheaQrFile, setCasheaQrFile] = useState<File | null>(null);
    const [casheaQrPreviewUrl, setCasheaQrPreviewUrl] = useState<string | null>(null);
    const [uploadingCasheaQr, setUploadingCasheaQr] = useState(false);
    const [businessType, setBusinessType] = useState<'restaurant' | 'hotel' | 'store'>('restaurant');

    // 2x3 Config
    const [hasTwoByThree, setHasTwoByThree] = useState(false);
    const [twoByThreeInitial, setTwoByThreeInitial] = useState(50);
    const [twoByThreeInstallments, setTwoByThreeInstallments] = useState(2);

    // Payment Methods states
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

    // Visibility & Verification states
    const [isVisible, setIsVisible] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const [verificationStatus, setVerificationStatus] = useState<'unverified' | 'pending' | 'verified' | 'rejected'>('unverified');
    const [rejectionReason, setRejectionReason] = useState('');
    const [addressReference, setAddressReference] = useState('');
    const [tiktok, setTiktok] = useState('');
    const [instagram, setInstagram] = useState('');
    const [requiresDelivery, setRequiresDelivery] = useState(true);
    const [existingRifUrl, setExistingRifUrl] = useState('');
    const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
    const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);

    useEffect(() => {
        if (!user || !rid) return;

        const fetchRestaurant = async () => {
            try {
                const { data, error } = await supabase
                    .from('comercios')
                    .select('*')
                    .eq('id', rid)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    console.error("Error fetching restaurant from Supabase:", error);
                }

                if (data) {
                    setName(data.name || '');

                    // Parse RIF (handle prefixes J, V, G, E, C)
                    const rawRif = (data.rif || '').trim();
                    const rifMatch = rawRif.match(/^([JVGECjvgec])[-_.\s]?([0-9-]*)$/);
                    if (rifMatch) {
                        setRifPrefix(rifMatch[1].toUpperCase() as any);
                        setRifNumber(rifMatch[2]);
                    } else if (rawRif) {
                        const firstChar = rawRif.charAt(0).toUpperCase();
                        if (['J', 'V', 'G', 'E', 'C'].includes(firstChar)) {
                            setRifPrefix(firstChar as any);
                            setRifNumber(rawRif.slice(1).replace(/^[-_.\s]/, ''));
                        } else {
                            setRifNumber(rawRif);
                        }
                    } else {
                        setRifPrefix('J');
                        setRifNumber('');
                    }

                    // Company type
                    setCompanyType(data.company_type || data.companyType || 'CA');

                    // Parse WhatsApp (strictly 10 digits, +58 locked)
                    const rawWhatsapp = (data.whatsapp || '').trim();
                    let cleanedWa = rawWhatsapp.replace(/\D/g, '');
                    if (cleanedWa.startsWith('58') && cleanedWa.length > 10) {
                        cleanedWa = cleanedWa.slice(2);
                    } else if (cleanedWa.startsWith('0')) {
                        cleanedWa = cleanedWa.slice(1);
                    }
                    setWhatsappNumber(cleanedWa.slice(0, 10));

                    setOwnDelivery(data.own_delivery ?? data.ownDelivery ?? false);
                    setAppDelivery(data.app_delivery ?? data.appDelivery ?? false);
                    setPickupOnly(data.pickup_only ?? data.pickupOnly ?? false);
                    setDeliveryTime(data.delivery_time || data.deliveryTime || '30-45 min');
                    setLogoUrl(data.logo_url || data.logoUrl || data.image || '');
                    setCoverUrl(data.cover_url || data.coverUrl || '');
                    setLocation(data.location || (data.locations && data.locations.length > 0 ? data.locations[0] : null));
                    setDeliveryRates(data.delivery_rates || data.deliveryRates || []);
                    setWorkingHours(data.working_hours || data.workingHours || DEFAULT_WORKING_HOURS);
                    setFollowerCount(data.follower_count || data.followerCount || 0);
                    setSocialLinks(data.social_links || data.socialLinks || []);
                    setCategoryId(data.category_id || data.categoryId || (data.category ? data.category : ''));
                    setSubCategoryId(data.sub_category_id || data.subCategoryId || '');
                    setHasCashea(data.has_cashea ?? data.hasCashea ?? false);
                    setCasheaQrUrl(data.cashea_qr_url || data.casheaQrUrl || '');
                    setHasTwoByThree(data.has_two_by_three ?? data.hasTwoByThree ?? false);
                    setTwoByThreeInitial(data.two_by_three_initial ?? data.twoByThreeInitial ?? 50);
                    setTwoByThreeInstallments(data.two_by_three_installments ?? data.twoByThreeInstallments ?? 2);
                    setBusinessType(data.business_type || data.businessType || 'restaurant');
                    setPaymentMethods(data.payment_methods || data.paymentMethods || []);

                    // Load visibility and verification
                    const isVis = data.is_visible ?? data.isVisible ?? false;
                    setIsVisible(isVis);
                    const isVer = data.is_verified ?? data.isVerified ?? false;
                    setIsVerified(isVer);
                    setVerificationStatus(data.verification_status || (isVer ? 'verified' : 'unverified'));
                    setRejectionReason(data.rejection_reason || '');
                    const addrRef = data.address_reference || data.verification_data?.addressReference || data.location?.reference || '';
                    setAddressReference(addrRef);
                    setTiktok(data.tiktok || data.verification_data?.tiktok || '');
                    setInstagram(data.instagram || data.verification_data?.instagram || '');
                    setRequiresDelivery(data.verification_data?.requiresDelivery ?? (data.own_delivery || data.app_delivery || true));
                    if (data.verification_data?.rifPhotoUrl) {
                        setExistingRifUrl(data.verification_data.rifPhotoUrl);
                    }

                    // Fetch followers list from Supabase
                    const { data: followersList } = await supabase
                        .from('restaurant_followers')
                        .select('*')
                        .eq('restaurant_id', rid)
                        .order('created_at', { ascending: false });
                    setFollowers(followersList || []);
                }
            } catch (error) {
                console.error("Error fetching restaurant:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchRestaurant();

        // Fetch Global Icons from Supabase
        const fetchGlobalIcons = async () => {
            try {
                const { data: icons } = await supabase.from('global_icons').select('*');
                if (icons) {
                    setGlobalIcons(icons);
                    const cashea = icons.find((icon: any) => icon.name?.toLowerCase() === 'cashea');
                    if (cashea) {
                        setCasheaIcon(cashea.url || cashea.imageUrl || cashea.image_url);
                    }
                }
            } catch (err) {
                console.error("Error fetching global icons:", err);
            }
        };
        fetchGlobalIcons();

        // Fetch Global Categories from Supabase
        const fetchGlobalCategories = async () => {
            try {
                const { data: categories } = await supabase.from('global_categories').select('*').order('name');
                if (categories) {
                    setGlobalCategories(categories.map((c: any) => ({
                        id: c.id,
                        name: c.name,
                        parentId: c.parent_id || c.parentId,
                        icon: c.icon || c.image_url,
                        isActive: c.is_active !== undefined ? c.is_active : true
                    })));
                }
            } catch (err) {
                console.error("Error fetching global categories:", err);
            }
        };
        fetchGlobalCategories();
    }, [user, rid]);

    // Helper to format WhatsApp
    const handleWhatsappChange = (val: string) => {
        let digits = val.replace(/\D/g, '');
        if (digits.startsWith('58') && digits.length > 10) {
            digits = digits.slice(2);
        }
        if (digits.startsWith('0')) {
            digits = digits.slice(1);
        }
        setWhatsappNumber(digits.slice(0, 10));
    };

    // Categories synchronized from Super Admin (Supabase global_categories)
    const firestoreParents = globalCategories.filter(c => !c.parentId && c.isActive !== false);
    const availableCategories: { id: string; name: string; icon?: string }[] = 
        firestoreParents.length > 0
            ? firestoreParents.map(c => ({ id: c.id, name: c.name, icon: c.icon || c.imageUrl }))
            : GLOBAL_CATEGORIES.map(name => ({ id: name, name, icon: undefined }));

    const currentCategory = availableCategories.find(c => c.id === categoryId || c.name === categoryId)
        || (categoryId ? { id: categoryId, name: categoryId } : null);

    const filteredCategories = availableCategories.filter(cat =>
        cat.name.toLowerCase().includes(businessTypeSearch.toLowerCase().trim())
    );

    // Subcategories for current category
    const firestoreSubs = globalCategories.filter(c => (c.parentId === currentCategory?.id || c.parentId === categoryId) && c.isActive !== false);
    const fallbackSubs = currentCategory?.name && CATEGORY_SECTORS[currentCategory.name]
        ? CATEGORY_SECTORS[currentCategory.name].map(s => ({ id: s, name: s }))
        : [];
    const availableSubCategories = firestoreSubs.length > 0 ? firestoreSubs : fallbackSubs;

    const handleSelectCategory = (cat: { id: string; name: string }) => {
        setCategoryId(cat.id);
        setSubCategoryId('');
        setIsBusinessTypeOpen(false);
        setBusinessTypeSearch('');

        const isHotel = cat.name.toLowerCase().includes('hotel') || cat.name.toLowerCase().includes('posada') || cat.name.toLowerCase().includes('hospedaje');
        const isRest = cat.name.toLowerCase().includes('restaurante') || cat.name.toLowerCase().includes('comida') || cat.name.toLowerCase().includes('panader');
        if (isHotel) {
            setBusinessType('hotel');
        } else if (isRest) {
            setBusinessType('restaurant');
        } else {
            setBusinessType('store');
        }
    };

    const handleToggleVisibility = async () => {
        if (verificationStatus !== 'verified') {
            alert("Para activar la visibilidad de tu tienda debes completar la verificación de tu negocio y ser aprobado por el Super Admin.");
            return;
        }

        const nextState = !isVisible;
        setIsTogglingVisibility(true);
        try {
            const { error } = await supabase
                .from('comercios')
                .update({
                    is_visible: nextState,
                    isVisible: nextState,
                    updated_at: new Date().toISOString()
                })
                .eq('id', rid);

            if (error) throw error;
            setIsVisible(nextState);
        } catch (err: any) {
            console.error("Error cambiando visibilidad:", err);
            alert("Error al cambiar el estado de visibilidad.");
        } finally {
            setIsTogglingVisibility(false);
        }
    };

    const handleSave = async () => {
        if (!user || !rid) return;
        setIsSaving(true);
        try {
            let currentLogoUrl = logoUrl;
            let currentCoverUrl = coverUrl;

            // Handle Logo Upload to Supabase Storage
            if (logoFile) {
                setUploadingLogo(true);
                const ext = logoFile.name.split('.').pop() || 'png';
                const path = `${rid}/logo_${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(path, logoFile, { upsert: true });
                if (upErr) throw upErr;
                const { data: urlData } = supabase.storage.from('store_assets').getPublicUrl(path);
                currentLogoUrl = urlData.publicUrl;
                setLogoUrl(currentLogoUrl);
                setLogoFile(null);
                setLogoPreviewUrl(null);
                setUploadingLogo(false);
            }

            // Handle Cover Upload to Supabase Storage
            if (coverFile) {
                setUploadingCover(true);
                const ext = coverFile.name.split('.').pop() || 'png';
                const path = `${rid}/cover_${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(path, coverFile, { upsert: true });
                if (upErr) throw upErr;
                const { data: urlData } = supabase.storage.from('store_assets').getPublicUrl(path);
                currentCoverUrl = urlData.publicUrl;
                setCoverUrl(currentCoverUrl);
                setCoverFile(null);
                setCoverPreviewUrl(null);
                setUploadingCover(false);
            }
            
            let currentCasheaQrUrl = casheaQrUrl;
            if (casheaQrFile) {
                setUploadingCasheaQr(true);
                const ext = casheaQrFile.name.split('.').pop() || 'png';
                const path = `${rid}/cashea_qr_${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(path, casheaQrFile, { upsert: true });
                if (upErr) throw upErr;
                const { data: urlData } = supabase.storage.from('store_assets').getPublicUrl(path);
                currentCasheaQrUrl = urlData.publicUrl;
                setCasheaQrUrl(currentCasheaQrUrl);
                setCasheaQrFile(null);
                setCasheaQrPreviewUrl(null);
                setUploadingCasheaQr(false);
            }

            const selectedCatObj = availableCategories.find(c => c.id === categoryId || c.name === categoryId);
            const finalCatName = selectedCatObj ? selectedCatObj.name : (categoryId || 'Comercio General');

            const isHotel = finalCatName.toLowerCase().includes('hotel') || finalCatName.toLowerCase().includes('posada') || finalCatName.toLowerCase().includes('hospedaje');
            const isRest = finalCatName.toLowerCase().includes('restaurante') || finalCatName.toLowerCase().includes('comida') || finalCatName.toLowerCase().includes('panader');
            const finalBusinessType = isHotel ? 'hotel' : (isRest ? 'restaurant' : 'store');

            const formattedRif = rifNumber.trim() ? `${rifPrefix}-${rifNumber.trim()}` : '';
            const fullWhatsapp = whatsappNumber.trim() ? `+58${whatsappNumber.trim()}` : '';

            const payload: any = {
                id: rid,
                name: name || '',
                rif: formattedRif,
                company_type: companyType || 'CA',
                whatsapp: fullWhatsapp,
                category: finalCatName,
                category_id: categoryId || '',
                sub_category_id: subCategoryId || '',
                business_type: finalBusinessType,
                own_delivery: ownDelivery || false,
                app_delivery: appDelivery || false,
                pickup_only: pickupOnly || false,
                delivery_time: deliveryTime || '30-45 min',
                logo_url: currentLogoUrl || '',
                cover_url: currentCoverUrl || '',
                image: currentLogoUrl || '',
                location: location || null,
                locations: location ? [location] : [],
                delivery_rates: deliveryRates || [],
                working_hours: workingHours || [],
                social_links: socialLinks || [],
                has_cashea: hasCashea || false,
                cashea_qr_url: currentCasheaQrUrl || '',
                has_two_by_three: hasTwoByThree || false,
                two_by_three_initial: twoByThreeInitial || 50,
                two_by_three_installments: twoByThreeInstallments || 2,
                payment_methods: paymentMethods || [],
                is_visible: isVisible,
                isVisible: isVisible,
                address_reference: addressReference || location?.reference || '',
                tiktok: tiktok || '',
                instagram: instagram || '',
                updated_at: new Date().toISOString()
            };

            const { error: saveErr } = await supabase.from('comercios').upsert(payload);
            if (saveErr) throw saveErr;

            console.log("Restaurant profile updated successfully via Supabase");
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (error) {
            console.error("Error updating restaurant:", error);
            alert("Error al guardar los cambios en la base de datos.");
        } finally {
            setIsSaving(false);
            setUploadingLogo(false);
            setUploadingCover(false);
            setUploadingCasheaQr(false);
        }
    };

    const addDeliveryRate = () => {
        setDeliveryRates([...deliveryRates, { minKm: 0, maxKm: 5, price: 1.0 }]);
    };

    const removeDeliveryRate = (index: number) => {
        setDeliveryRates(deliveryRates.filter((_, i) => i !== index));
    };

    const updateDeliveryRate = (index: number, field: keyof DeliveryRate, value: number) => {
        const newRates = [...deliveryRates];
        newRates[index] = { ...newRates[index], [field]: value };
        setDeliveryRates(newRates);
    };

    const updateWorkingHours = (index: number, field: keyof WorkingHour, value: any) => {
        const newHours = [...workingHours];
        newHours[index] = { ...newHours[index], [field]: value };
        setWorkingHours(newHours);
    };

    const applyBulkHours = (startIdx: number, endIdx: number) => {
        const reference = workingHours[0]; // Use Monday as reference or first item
        const newHours = [...workingHours];
        for (let i = startIdx; i <= endIdx; i++) {
            newHours[i] = { ...newHours[i], open: reference.open, close: reference.close, closed: reference.closed };
        }
        setWorkingHours(newHours);
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setLogoFile(file);
            setLogoPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverFile(file);
            setCoverPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleCasheaQrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCasheaQrFile(file);
            setCasheaQrPreviewUrl(URL.createObjectURL(file));
        }
    };

    const addSocialLink = (icon: any) => {
        if (socialLinks.find(s => s.id === icon.id)) {
            alert("Esta red social ya ha sido agregada.");
            return;
        }
        setSocialLinks([...socialLinks, { id: icon.id, name: icon.name, imageUrl: icon.imageUrl, url: '' }]);
        setIsSocialAdding(false);
    };

    const removeSocialLink = (id: string) => {
        setSocialLinks(socialLinks.filter(s => s.id !== id));
    };

    const updateSocialUrl = (id: string, url: string) => {
        setSocialLinks(socialLinks.map(s => s.id === id ? { ...s, url } : s));
    };

    const addPaymentMethod = () => {
        setPaymentMethods([...paymentMethods, { type: 'Pago Móvil', bank: '', rif: '', phone: '', owner: '' }]);
    };

    const removePaymentMethod = (index: number) => {
        setPaymentMethods(paymentMethods.filter((_, i) => i !== index));
    };

    const updatePaymentMethod = (index: number, field: keyof PaymentMethod, value: string) => {
        const newMethods = [...paymentMethods];
        newMethods[index] = { ...newMethods[index], [field]: value };
        setPaymentMethods(newMethods);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-slate-900 animate-spin" />
                <p className="mt-4 text-slate-500 font-bold">Cargando configuración...</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-700 pb-20">
            <div className="flex justify-between items-end flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h1 className="text-3xl font-black text-slate-900">Configuración del Negocio</h1>
                        {isVerified && (
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs font-black px-3 py-1 rounded-full border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Negocio Verificado ✓
                            </span>
                        )}
                    </div>
                    <p className="text-slate-500 font-medium">Gestiona la información pública y comercial de tu negocio ({currentCategory?.name || 'Comercio'}).</p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* Switch de Visibilidad */}
                    <div className={`p-2.5 px-4 rounded-2xl border flex items-center gap-3 transition-all ${isVisible
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}>
                        <div className="flex flex-col text-left">
                            <span className="text-[10px] uppercase font-black tracking-wider opacity-70">
                                Estado en la App
                            </span>
                            <span className="text-xs font-black">
                                {isVisible ? 'Tienda Visible' : 'Tienda No Visible'}
                            </span>
                        </div>
                        
                        <button
                            type="button"
                            onClick={handleToggleVisibility}
                            disabled={isTogglingVisibility || !isVerified}
                            title={!isVerified ? "Debes verificar tu negocio para activar la visibilidad" : isVisible ? "Haz clic para ocultar temporalmente tu tienda" : "Haz clic para hacer visible tu tienda"}
                            className={`p-1 rounded-xl transition-all ${!isVerified ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95 cursor-pointer'}`}
                        >
                            {isTogglingVisibility ? (
                                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                            ) : !isVerified ? (
                                <div className="flex items-center gap-1 bg-slate-200 text-slate-600 px-2 py-1 rounded-lg text-[10px] font-black">
                                    <Lock className="w-3 h-3" /> Bloqueado
                                </div>
                            ) : isVisible ? (
                                <ToggleRight className="w-8 h-8 text-emerald-600" />
                            ) : (
                                <ToggleLeft className="w-8 h-8 text-slate-400" />
                            )}
                        </button>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={isSaving || uploadingLogo || uploadingCover}
                        className={`px-6 py-3 rounded-2xl font-black shadow-lg flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 ${saved ? 'bg-green-500 text-slate-900 shadow-green-500/20' : 'bg-primary text-slate-900 shadow-primary/20'
                            }`}
                    >
                        {(isSaving || uploadingLogo || uploadingCover) ? <Loader2 className="w-5 h-5 animate-spin" /> : saved ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />}
                        <span>{(isSaving || uploadingLogo || uploadingCover) ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar Cambios'}</span>
                    </button>
                </div>
            </div>

            {/* Banner de Verificación y Visibilidad */}
            {verificationStatus === 'unverified' && (
                <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border-2 border-amber-400/80 p-6 rounded-[32px] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-in fade-in">
                    <div className="flex items-start gap-4">
                        <div className="p-3.5 bg-amber-500 text-slate-950 rounded-2xl shadow-md shadow-amber-500/20 shrink-0">
                            <ShieldAlert className="w-7 h-7" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-black text-slate-900 leading-snug">
                                Configura tu cuenta para estar verificado y ser visible
                            </h3>
                            <p className="text-xs md:text-sm text-slate-600 font-semibold max-w-2xl leading-relaxed">
                                Tu tienda actualmente está <strong className="text-slate-900">oculta</strong> en la app. Para cumplir con la normativa, activar la visibilidad y empezar a vender, envía tus recaudos legales (RIF, redes sociales, punto de referencia y WhatsApp).
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsVerificationModalOpen(true)}
                        className="px-6 py-3.5 bg-slate-950 hover:bg-slate-800 text-primary hover:text-white font-black text-xs md:text-sm rounded-2xl shadow-lg shadow-slate-950/20 flex items-center justify-center gap-2 shrink-0 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                    >
                        <ShieldCheck className="w-5 h-5 text-primary" />
                        <span>VERIFICAR NEGOCIO</span>
                    </button>
                </div>
            )}

            {verificationStatus === 'pending' && (
                <div className="bg-blue-50 border-2 border-blue-200 p-6 rounded-[32px] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-in fade-in">
                    <div className="flex items-start gap-4">
                        <div className="p-3.5 bg-blue-500 text-white rounded-2xl shadow-md shadow-blue-500/20 shrink-0 animate-pulse">
                            <Clock className="w-7 h-7" />
                        </div>
                        <div className="space-y-1">
                            <div className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-0.5">
                                Solicitud en Revisión
                            </div>
                            <h3 className="text-lg font-black text-slate-900 leading-snug">
                                Tu solicitud de verificación está en auditoría por el Super Admin
                            </h3>
                            <p className="text-xs md:text-sm text-slate-600 font-semibold max-w-2xl leading-relaxed">
                                Hemos recibido tus datos, comprobante de RIF SENIAT y redes sociales. El equipo administrativo está revisando la información para habilitar la visibilidad de tu tienda.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsVerificationModalOpen(true)}
                        className="px-5 py-3 bg-white hover:bg-slate-50 text-slate-800 font-black text-xs rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center gap-2 shrink-0 transition-all cursor-pointer"
                    >
                        <span>Ver Recaudos Enviados</span>
                    </button>
                </div>
            )}

            {verificationStatus === 'rejected' && (
                <div className="bg-rose-50 border-2 border-rose-300 p-6 rounded-[32px] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-in fade-in">
                    <div className="flex items-start gap-4">
                        <div className="p-3.5 bg-rose-500 text-white rounded-2xl shadow-md shadow-rose-500/20 shrink-0">
                            <ShieldX className="w-7 h-7" />
                        </div>
                        <div className="space-y-1">
                            <div className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider mb-0.5">
                                Verificación Rechazada
                            </div>
                            <h3 className="text-lg font-black text-slate-900 leading-snug">
                                Observaciones en tu solicitud de verificación
                            </h3>
                            <p className="text-xs md:text-sm text-rose-900 font-bold max-w-2xl leading-relaxed">
                                Motivo indicado: <span className="underline">{rejectionReason || 'Documentación incompleta o ilegible.'}</span> Por favor corrige la información y vuelve a enviar tus recaudos.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsVerificationModalOpen(true)}
                        className="px-6 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs md:text-sm rounded-2xl shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 shrink-0 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                    >
                        <ShieldCheck className="w-5 h-5" />
                        <span>VOLVER A VERIFICAR</span>
                    </button>
                </div>
            )}

            {verificationStatus === 'verified' && (
                <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-[28px] flex items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-center gap-3.5">
                        <div className="p-2.5 bg-emerald-500 text-white rounded-xl shrink-0">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="font-black text-emerald-950 text-sm">
                                Comercio Verificado Oficialmente ✓
                            </h4>
                            <p className="text-xs text-emerald-800 font-medium">
                                Tu negocio cuenta con la certificación oficial de Encontrado en un 2x3 / Deliexpress. Puedes alternar la visibilidad de tu tienda arriba cuando lo desees.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left Column: Logo & Main Info */}
                <div className="md:col-span-2 space-y-6">
                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <Store className="w-6 h-6 text-slate-900" />
                            Información Principal
                        </h2>

                        <div className="space-y-6">
                            {/* Brand Assets */}
                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-6">
                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <ImageIcon className="w-5 h-5 text-slate-900" />
                                    Imagen de Marca
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Logo Upload */}
                                    <div className="space-y-3">
                                        <label className="text-sm font-black text-slate-400 uppercase ml-2">Logo del Negocio</label>
                                        <div className="flex items-center gap-4">
                                            <div className="relative w-24 h-24 rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group">
                                                {(logoPreviewUrl || logoUrl) ? (
                                                    <img
                                                        src={logoPreviewUrl || logoUrl}
                                                        alt="Logo"
                                                        className="w-full h-full object-contain p-2"
                                                    />
                                                ) : (
                                                    <div className="text-slate-300">
                                                        <ImageIcon className="w-8 h-8" />
                                                    </div>
                                                )}
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleLogoChange}
                                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                                    disabled={uploadingLogo}
                                                />
                                                {uploadingLogo && (
                                                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10 pointer-events-none">
                                                        <Loader2 className="w-6 h-6 text-slate-900 animate-spin" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                    <Camera className="w-6 h-6 text-white" />
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500 italic flex-1">Formato cuadrado. PNG transparente recomendado.</p>
                                        </div>
                                    </div>

                                    {/* Cover Upload */}
                                    <div className="space-y-3">
                                        <label className="text-sm font-black text-slate-400 uppercase ml-2">Foto de Portada</label>
                                        <div className="flex flex-col gap-3">
                                            <div className="relative w-full h-24 rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group">
                                                {(coverPreviewUrl || coverUrl) ? (
                                                    <img
                                                        src={coverPreviewUrl || coverUrl}
                                                        alt="Portada"
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="text-slate-300">
                                                        <ImageIcon className="w-8 h-8" />
                                                    </div>
                                                )}
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleCoverChange}
                                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                                    disabled={uploadingCover}
                                                />
                                                {uploadingCover && (
                                                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10 pointer-events-none">
                                                        <Loader2 className="w-6 h-6 text-slate-900 animate-spin" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                    <Camera className="w-6 h-6 text-white" />
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500 italic">Banner superior. Recomendado 1200x400px.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-bold text-slate-700 ml-1">Nombre del Negocio / Razón Comercial</label>
                                    {isVerified && (
                                        <span className="text-[11px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                                            <Lock className="w-3 h-3" /> Protegido por Verificación
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <input
                                        type="text"
                                        disabled={isVerified}
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className={`w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-slate-800 ${isVerified ? 'opacity-75 bg-slate-100 cursor-not-allowed pr-10' : ''}`}
                                        placeholder="Ej: Deliexpress Gourmet"
                                    />
                                    {isVerified && (
                                        <Lock className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    )}
                                </div>
                                {isVerified && (
                                    <p className="text-[11px] text-amber-700 ml-1 font-semibold">
                                        Este campo no puede modificarse tras la verificación oficial. Para cambios de razón social, contacta a soporte administrativo.
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-bold text-slate-700 ml-1">RIF del Negocio</label>
                                        {isVerified && (
                                            <span className="text-[11px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                                                <Lock className="w-3 h-3" /> Bloqueado
                                            </span>
                                        )}
                                    </div>
                                    <div className={`flex bg-slate-50 border-2 border-transparent focus-within:border-primary focus-within:bg-white rounded-2xl transition-all overflow-hidden ${isVerified ? 'opacity-75 bg-slate-100 cursor-not-allowed' : ''}`}>
                                        <select
                                            disabled={isVerified}
                                            value={rifPrefix}
                                            onChange={(e) => setRifPrefix(e.target.value as any)}
                                            className={`bg-slate-100/90 hover:bg-slate-200/70 border-r border-slate-200 px-3 py-4 font-black text-slate-800 text-sm outline-none ${isVerified ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                            title="Selecciona la letra del RIF en Venezuela"
                                        >
                                            <option value="J">J (Jurídico)</option>
                                            <option value="V">V (Venezolano)</option>
                                            <option value="G">G (Gubernamental)</option>
                                            <option value="E">E (Extranjero)</option>
                                            <option value="C">C (Comunal / EPS)</option>
                                        </select>
                                        <input
                                            type="text"
                                            disabled={isVerified}
                                            value={rifNumber}
                                            onChange={(e) => setRifNumber(e.target.value.replace(/[^0-9-]/g, ''))}
                                            className={`w-full bg-transparent p-4 outline-none font-bold text-slate-800 tracking-wide ${isVerified ? 'cursor-not-allowed' : ''}`}
                                            placeholder="12345678-9"
                                        />
                                        {isVerified && (
                                            <div className="pr-4 flex items-center">
                                                <Lock className="w-4 h-4 text-slate-400" />
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-slate-400 ml-1">
                                        {isVerified ? 'El RIF está protegido y no es modificable tras verificación.' : `Letra venezolana (${rifPrefix}) + número de RIF`}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700 ml-1">¿Qué tipo de compañía es tu empresa?</label>
                                    <div className="relative">
                                        <select
                                            value={companyType}
                                            onChange={(e) => setCompanyType(e.target.value)}
                                            className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 pr-10 rounded-2xl outline-none transition-all font-bold text-slate-800 appearance-none cursor-pointer"
                                        >
                                            <option value="FP">FP - Firma Personal</option>
                                            <option value="PYME">PYME - Pequeña y Mediana Empresa</option>
                                            <option value="CA">C.A. - Compañía Anónima</option>
                                            <option value="SRL">S.R.L. - Sociedad de Responsabilidad Limitada</option>
                                            <option value="SA">S.A. - Sociedad Anónima</option>
                                            <option value="Emprendimiento">Emprendimiento (RNE)</option>
                                            <option value="Cooperativa">Cooperativa</option>
                                            <option value="Comunal">Empresa Comunal / Propiedad Social</option>
                                            <option value="Otro">Otra Formalidad</option>
                                        </select>
                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                    </div>
                                    <p className="text-[11px] text-slate-400 ml-1">Estructura legal registrada en Venezuela</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">WhatsApp de Pedidos y Contacto</label>
                                <div className="flex bg-slate-50 border-2 border-transparent focus-within:border-primary focus-within:bg-white rounded-2xl transition-all overflow-hidden">
                                    <div className="flex items-center gap-1.5 px-4 py-4 bg-slate-100/90 border-r border-slate-200 text-slate-800 font-black text-sm select-none">
                                        <span className="text-base">🇻🇪</span>
                                        <span>+58</span>
                                    </div>
                                    <input
                                        type="tel"
                                        value={whatsappNumber}
                                        onChange={(e) => handleWhatsappChange(e.target.value)}
                                        maxLength={10}
                                        className="w-full bg-transparent p-4 outline-none font-bold text-slate-800 tracking-wide text-base"
                                        placeholder="412 1234567"
                                    />
                                </div>
                                <p className="text-[11px] text-slate-400 ml-1">Escribe únicamente los 10 dígitos locales (ej: 4121234567). El prefijo +58 está fijado.</p>
                            </div>

                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div>
                                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">
                                            Tipo de Negocio / Rama Comercial
                                        </h3>
                                        <p className="text-xs text-slate-400 font-medium">
                                            Selecciona el ramo al que pertenece tu comercio en la ciudad
                                        </p>
                                    </div>
                                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500/10 text-amber-700 border border-amber-500/20 text-[10px] font-black rounded-full uppercase tracking-wider">
                                        👑 Sincronizado con Super Admin
                                    </span>
                                </div>

                                {/* Botón Desplegable */}
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsBusinessTypeOpen(!isBusinessTypeOpen)}
                                        className="w-full flex items-center justify-between p-4 bg-white border-2 border-slate-200 hover:border-primary focus:border-primary rounded-2xl transition-all shadow-xs group"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-2xl shrink-0 group-hover:bg-primary/20 transition-colors">
                                                {currentCategory ? getCategoryEmoji(currentCategory.name) : '🏪'}
                                            </div>
                                            <div className="text-left truncate">
                                                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                                    Ramo Seleccionado
                                                </span>
                                                <span className="block text-base font-black text-slate-900 truncate">
                                                    {currentCategory ? currentCategory.name : 'Selecciona el Tipo de Negocio...'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isBusinessTypeOpen ? 'rotate-180 text-primary' : ''}`} />
                                        </div>
                                    </button>

                                    {/* Backdrop para cerrar al hacer clic afuera */}
                                    {isBusinessTypeOpen && (
                                        <div
                                            className="fixed inset-0 z-20"
                                            onClick={() => setIsBusinessTypeOpen(false)}
                                        />
                                    )}

                                    {/* Menú Desplegable con Filtro de Búsqueda */}
                                    <AnimatePresence>
                                        {isBusinessTypeOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                                                transition={{ duration: 0.15 }}
                                                className="absolute z-30 left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-2xl p-3 space-y-2 max-h-[380px] overflow-hidden flex flex-col"
                                            >
                                                {/* Buscador interno */}
                                                <div className="relative shrink-0">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                    <input
                                                        type="text"
                                                        value={businessTypeSearch}
                                                        onChange={(e) => setBusinessTypeSearch(e.target.value)}
                                                        placeholder="Buscar tipo de negocio (ej: ferretería, panadería, repuestos...)"
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-primary"
                                                        autoFocus
                                                    />
                                                </div>

                                                {/* Lista de ramas comerciales */}
                                                <div className="overflow-y-auto space-y-1 pr-1 flex-1">
                                                    {filteredCategories.length > 0 ? (
                                                        filteredCategories.map(cat => {
                                                            const isSelected = (currentCategory?.id === cat.id || currentCategory?.name === cat.name);
                                                            return (
                                                                <button
                                                                    key={cat.id}
                                                                    type="button"
                                                                    onClick={() => handleSelectCategory(cat)}
                                                                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left ${
                                                                        isSelected
                                                                            ? 'bg-primary/20 text-slate-900 font-black'
                                                                            : 'hover:bg-slate-50 text-slate-700 font-bold'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-xl">{getCategoryEmoji(cat.name)}</span>
                                                                        <span className="text-sm">{cat.name}</span>
                                                                    </div>
                                                                    {isSelected && (
                                                                        <span className="w-2.5 h-2.5 rounded-full bg-slate-900" />
                                                                    )}
                                                                </button>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="py-6 text-center text-xs text-slate-400 font-bold">
                                                            No se encontraron resultados para "{businessTypeSearch}"
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 text-center font-medium">
                                                    🔒 Categorías administradas exclusivamente por el Super Administrador.
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Selector de Especialidad / Subcategoría si aplica */}
                                {availableSubCategories.length > 0 && (
                                    <div className="space-y-1.5 pt-2">
                                        <label className="text-xs font-bold text-slate-600 ml-1">
                                            Especialidad / Subcategoría dentro de {currentCategory?.name || 'tu negocio'}
                                        </label>
                                        <div className="relative">
                                            <select
                                                value={subCategoryId}
                                                onChange={(e) => setSubCategoryId(e.target.value)}
                                                className="w-full bg-white border border-slate-200 p-3.5 pr-10 rounded-xl outline-none focus:border-primary font-bold text-slate-800 text-sm appearance-none cursor-pointer"
                                            >
                                                <option value="">Selecciona una Especialidad (Opcional)</option>
                                                {availableSubCategories.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <MapPin className="w-6 h-6 text-slate-900" />
                            Ubicación de la Sede
                        </h2>

                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-6 group relative">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Estado</label>
                                    <select
                                        value={location?.state || ''}
                                        onChange={(e) => {
                                            const newState = e.target.value;
                                            const newCity = (VENEZUELA_DATA[newState] && VENEZUELA_DATA[newState].length > 0) ? VENEZUELA_DATA[newState][0] : '';
                                            setLocation({
                                                ...(location || { address: '', type: 'principal' }),
                                                state: newState,
                                                city: newCity
                                            });
                                        }}
                                        className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                    >
                                        <option value="">Selecciona un Estado</option>
                                        {VENEZUELA_STATES.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ciudad</label>
                                    <select
                                        value={location?.city || ''}
                                        onChange={(e) => setLocation({
                                            ...(location || { address: '', state: '', type: 'principal' }),
                                            city: e.target.value
                                        })}
                                        className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                        disabled={!location?.state}
                                    >
                                        <option value="">Selecciona una Ciudad</option>
                                        {location?.state && VENEZUELA_DATA[location.state]?.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1 relative">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Ubicación GPS</label>
                                <button
                                    onClick={() => setShowPicker(0)}
                                    className={`w-full p-4 rounded-xl border font-bold text-sm flex items-center gap-2 justify-center transition-all ${location?.coords ? 'border-primary bg-primary/5 text-slate-900' : 'border-slate-200 bg-white text-slate-500 hover:border-primary hover:text-slate-900'}`}
                                >
                                    <MapIcon className="w-4 h-4" />
                                    {location?.coords ? 'Ubicación Marcada (Haz clic para reubicar)' : 'Marcar Ubicación en el Mapa'}
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Dirección Detallada</label>
                                    <input
                                        type="text"
                                        value={location?.address || ''}
                                        onChange={(e) => setLocation({
                                            ...(location || { city: '', state: '', type: 'principal' }),
                                            address: e.target.value
                                        })}
                                        className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                        placeholder="Ej: Av. Principal de El Rosal, Edif. Centro"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Referencia (Opcional)</label>
                                    <input
                                        type="text"
                                        value={location?.reference || ''}
                                        onChange={(e) => setLocation({
                                            ...(location || { address: '', city: '', state: '', type: 'principal' }),
                                            reference: e.target.value
                                        })}
                                        className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                        placeholder="Ej: Frente a la plaza, diagonal al banco"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Right Column: Settings */}
                <div className="space-y-6">
                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                            <Truck className="w-6 h-6 text-slate-900" />
                            Logística
                        </h2>

                        <div className="space-y-4">
                            <div
                                className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl cursor-pointer group"
                                onClick={() => {
                                    setOwnDelivery(!ownDelivery);
                                    if (!ownDelivery) {
                                        setAppDelivery(false);
                                    }
                                }}
                            >
                                <span className="font-bold text-slate-700">Servicio de Delivery Propio</span>
                                <div className={`w-12 h-6 rounded-full relative transition-colors ${ownDelivery ? 'bg-primary' : 'bg-slate-200'}`}>
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${ownDelivery ? 'left-7' : 'left-1'}`}></div>
                                </div>
                            </div>

                            <div
                                className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl cursor-pointer group"
                                onClick={() => {
                                    setAppDelivery(!appDelivery);
                                    if (!appDelivery) {
                                        setOwnDelivery(false);
                                    }
                                }}
                            >
                                <span className="font-bold text-slate-700">Utilizar Delivery de la App (2x3)</span>
                                <div className={`w-12 h-6 rounded-full relative transition-colors ${appDelivery ? 'bg-primary' : 'bg-slate-200'}`}>
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${appDelivery ? 'left-7' : 'left-1'}`}></div>
                                </div>
                            </div>

                            <div
                                className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl cursor-pointer group"
                                onClick={() => {
                                    setPickupOnly(!pickupOnly);
                                }}
                            >
                                <div>
                                    <span className="font-bold text-slate-700 block">PickUp</span>
                                    <span className="text-xs text-slate-500">Permitir a los clientes recoger su pedido en el local.</span>
                                </div>
                                <div className={`w-12 h-6 rounded-full relative transition-colors ${pickupOnly ? 'bg-primary' : 'bg-slate-200'}`}>
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${pickupOnly ? 'left-7' : 'left-1'}`}></div>
                                </div>
                            </div>
                        </div>

                        {ownDelivery && (
                            <div className="space-y-4 pt-2">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider">Tarifas por Distancia</h3>
                                    <button
                                        onClick={addDeliveryRate}
                                        className="text-slate-900 text-xs font-bold flex items-center gap-1 hover:underline"
                                    >
                                        <Plus className="w-3 h-3" />
                                        Añadir Rango
                                    </button>
                                </div>

                                {deliveryRates.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl">No hay tarifas configuradas. Se aplicará tarifa fija.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {deliveryRates.map((rate, idx) => (
                                            <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                                <div className="flex-1 flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={rate.minKm}
                                                        onChange={(e) => updateDeliveryRate(idx, 'minKm', parseFloat(e.target.value))}
                                                        className="w-16 bg-slate-50 p-2 rounded-lg text-xs font-bold text-center outline-none focus:border-primary border border-transparent"
                                                    />
                                                    <span className="text-slate-400 text-[10px] font-bold">A</span>
                                                    <input
                                                        type="number"
                                                        value={rate.maxKm}
                                                        onChange={(e) => updateDeliveryRate(idx, 'maxKm', parseFloat(e.target.value))}
                                                        className="w-16 bg-slate-50 p-2 rounded-lg text-xs font-bold text-center outline-none focus:border-primary border border-transparent"
                                                    />
                                                    <span className="text-slate-400 text-[10px] font-bold uppercase">KM</span>
                                                </div>
                                                <div className={`flex items-center gap-1 px-3 py-2 rounded-lg border transition-all ${rate.price === 0 ? 'bg-emerald-50 border-emerald-100 ring-2 ring-emerald-500/20' : 'bg-green-50 border-green-100'}`}>
                                                    <span className={`${rate.price === 0 ? 'text-emerald-600' : 'text-green-600'} text-[10px] font-black`}>$</span>
                                                    <input
                                                        type="number"
                                                        value={rate.price}
                                                        onChange={(e) => updateDeliveryRate(idx, 'price', parseFloat(e.target.value))}
                                                        className={`w-16 bg-transparent text-xs font-black outline-none ${rate.price === 0 ? 'text-emerald-700' : 'text-green-700'}`}
                                                    />
                                                    {rate.price === 0 && (
                                                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter ml-1">GRATIS</span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => removeDeliveryRate(idx)}
                                                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-500 ml-2">Tiempo Prep. Promedio</label>
                            <div className="relative">
                                <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <select
                                    value={deliveryTime}
                                    onChange={(e) => setDeliveryTime(e.target.value)}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary focus:bg-white p-4 pl-12 rounded-2xl outline-none transition-all font-bold text-slate-700 appearance-none"
                                >
                                    <option value="15-30 min">15-30 min</option>
                                    <option value="30-45 min">30-45 min</option>
                                    <option value="45-60 min">45-60 min</option>
                                    <option value="60+ min">Más de 1 hora</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div
                                className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer group transition-all border-2 ${hasCashea ? 'bg-yellow-50 border-yellow-200 shadow-lg shadow-yellow-100/50' : 'bg-slate-50 border-transparent hover:border-slate-100'}`}
                                onClick={() => setHasCashea(!hasCashea)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${hasCashea ? 'bg-yellow-400 shadow-lg shadow-yellow-400/30 ring-4 ring-yellow-500/10' : 'bg-white shadow-sm border border-slate-100'}`}>
                                        <img
                                            src={casheaIcon || "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/store_assets/logo_cashea.png"}
                                            className={`w-8 h-8 object-contain transition-all ${hasCashea ? 'scale-110' : ''}`}
                                            alt="Cashea"
                                        />
                                    </div>
                                    <div>
                                        <p className={`font-black tracking-tight leading-none mb-1 ${hasCashea ? 'text-yellow-900' : 'text-slate-700'}`}>Servicio Cashea</p>
                                        <p className={`text-[10px] font-bold ${hasCashea ? 'text-amber-700' : 'text-slate-400'}`}>
                                            {hasCashea ? 'Insignia habilitada en el perfil' : 'Habilitar distintivo de pago por cuotas'}
                                        </p>
                                    </div>
                                </div>
                                <div className={`w-12 h-6 rounded-full relative transition-colors ${hasCashea ? 'bg-yellow-400' : 'bg-slate-200'}`}>
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${hasCashea ? 'left-7' : 'left-1'}`}></div>
                                </div>
                            </div>
                            
                            {hasCashea && (
                                <div className="space-y-3 bg-white p-4 rounded-2xl border border-yellow-200">
                                    <label className="text-sm font-black text-slate-400 uppercase ml-2">Sube tu Código QR de Cashea</label>
                                    <div className="flex items-center gap-4">
                                        <div className="relative w-24 h-24 rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group">
                                            {(casheaQrPreviewUrl || casheaQrUrl) ? (
                                                <img
                                                    src={casheaQrPreviewUrl || casheaQrUrl}
                                                    alt="Cashea QR"
                                                    className="w-full h-full object-contain p-2"
                                                />
                                            ) : (
                                                <div className="text-slate-300">
                                                    <ImageIcon className="w-8 h-8" />
                                                </div>
                                            )}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleCasheaQrChange}
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                disabled={uploadingCasheaQr}
                                            />
                                            {uploadingCasheaQr && (
                                                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10 pointer-events-none">
                                                    <Loader2 className="w-6 h-6 text-slate-900 animate-spin" />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                <Camera className="w-6 h-6 text-white" />
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-500 italic flex-1">Este QR se mostrará automáticamente en el Chat a los clientes que soliciten pago por Cashea.</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 2x3 Config */}
                        <div className={`p-4 rounded-2xl border-2 transition-all ${hasTwoByThree ? 'bg-primary/5 border-primary/20' : 'bg-slate-50 border-transparent hover:border-slate-100'}`}>
                            <div 
                                className="flex items-center justify-between cursor-pointer"
                                onClick={() => setHasTwoByThree(!hasTwoByThree)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${hasTwoByThree ? 'bg-primary shadow-lg shadow-primary/30' : 'bg-white shadow-sm border border-slate-100'}`}>
                                        <span className={`font-black text-xl italic ${hasTwoByThree ? 'text-white' : 'text-slate-400'}`}>2x3</span>
                                    </div>
                                    <div>
                                        <p className={`font-black tracking-tight leading-none mb-1 ${hasTwoByThree ? 'text-slate-900' : 'text-slate-700'}`}>Sistema "2x3 Resuelve"</p>
                                        <p className={`text-[10px] font-bold ${hasTwoByThree ? 'text-slate-900/70' : 'text-slate-400'}`}>
                                            Permitir pagos financiados en cuotas
                                        </p>
                                    </div>
                                </div>
                                <div className={`w-12 h-6 rounded-full relative transition-colors ${hasTwoByThree ? 'bg-primary' : 'bg-slate-200'}`}>
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${hasTwoByThree ? 'left-7' : 'left-1'}`}></div>
                                </div>
                            </div>

                            {hasTwoByThree && (
                                <div className="mt-4 pt-4 border-t border-primary/10 grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Pago Inicial (%)</label>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                min="10" max="90"
                                                value={twoByThreeInitial}
                                                onChange={(e) => setTwoByThreeInitial(Number(e.target.value))}
                                                className="w-full bg-white border border-slate-200 p-3 pr-8 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nº de Cuotas Restantes</label>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                min="1" max="10"
                                                value={twoByThreeInstallments}
                                                onChange={(e) => setTwoByThreeInstallments(Number(e.target.value))}
                                                className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="bg-white p-6 md:p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                            <div>
                                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2.5">
                                    <Clock className="w-5 h-5 text-primary" />
                                    Horario de Trabajo
                                </h2>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">
                                    Configura los horarios de atención al público de tu negocio
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => applyBulkHours(0, 4)}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all active:scale-95"
                                    title="Aplica el horario de Lunes a Viernes"
                                >
                                    Lun - Vie
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyBulkHours(0, 6)}
                                    className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-slate-900 text-xs font-black rounded-xl transition-all active:scale-95"
                                    title="Aplica el horario de Lunes a los 7 días"
                                >
                                    Toda la Semana
                                </button>
                            </div>
                        </div>

                        <div className="divide-y divide-slate-100">
                            {workingHours.map((wh, idx) => (
                                <div
                                    key={wh.day}
                                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2 rounded-2xl hover:bg-slate-50/70 transition-colors"
                                >
                                    {/* Left: Day & Status indicator */}
                                    <div className="flex items-center gap-3 min-w-[130px]">
                                        <span className={`w-2.5 h-2.5 rounded-full transition-all ${
                                            wh.closed ? 'bg-slate-300' : 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                                        }`} />
                                        <span className="text-sm font-bold text-slate-800">
                                            {wh.day}
                                        </span>
                                    </div>

                                    {/* Center: Hours inputs or Closed badge */}
                                    <div className="flex-1 flex items-center justify-start sm:justify-center">
                                        {!wh.closed ? (
                                            <div className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                                                <input
                                                    type="time"
                                                    value={wh.open}
                                                    onChange={(e) => updateWorkingHours(idx, 'open', e.target.value)}
                                                    className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
                                                />
                                                <span className="text-slate-300 font-bold text-xs">—</span>
                                                <input
                                                    type="time"
                                                    value={wh.close}
                                                    onChange={(e) => updateWorkingHours(idx, 'close', e.target.value)}
                                                    className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
                                                />
                                            </div>
                                        ) : (
                                            <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1 rounded-xl">
                                                No laborable / Cerrado
                                            </span>
                                        )}
                                    </div>

                                    {/* Right: Modern Pill Toggle */}
                                    <div className="flex items-center justify-end">
                                        <button
                                            type="button"
                                            onClick={() => updateWorkingHours(idx, 'closed', !wh.closed)}
                                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                                wh.closed
                                                    ? 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                            }`}
                                        >
                                            {wh.closed ? 'Cerrado' : 'Abierto'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <p className="text-[11px] text-slate-400 text-center font-medium pt-2">
                            💡 Tip: Configura el horario del Lunes y presiona <strong>"Toda la Semana"</strong> para sincronizarlo rápidamente.
                        </p>
                    </section>

                    {/* Social Media Section */}
                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                <Share2 className="w-6 h-6 text-slate-900" />
                                Redes Sociales
                            </h2>
                            <button
                                onClick={() => setIsSocialAdding(!isSocialAdding)}
                                className="flex items-center gap-1.5 text-slate-900 text-xs font-bold hover:underline"
                            >
                                <Plus className="w-4 h-4" />
                                Añadir Red
                            </button>
                        </div>

                        <AnimatePresence>
                            {isSocialAdding && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                        {globalIcons.map(icon => (
                                            <button
                                                key={icon.id}
                                                onClick={() => addSocialLink(icon)}
                                                className="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl hover:border-primary border-2 border-transparent transition-all group"
                                            >
                                                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center p-2 group-hover:scale-110 transition-transform">
                                                    <img src={icon.imageUrl} alt={icon.name} className="w-full h-full object-contain" />
                                                </div>
                                                <span className="text-[10px] font-black text-slate-700 uppercase tracking-tighter truncate w-full">{icon.name}</span>
                                            </button>
                                        ))}
                                        {globalIcons.length === 0 && (
                                            <p className="col-span-full text-center text-xs text-slate-400 p-4">No hay redes sociales configuradas por el administrador.</p>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="space-y-4">
                            {socialLinks.length === 0 ? (
                                <div className="text-center py-8 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                    <Globe className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                                    <p className="text-slate-400 text-sm font-medium">Conecta tus redes para ganar confianza.</p>
                                </div>
                            ) : (
                                socialLinks.map(social => (
                                    <div key={social.id} className="flex items-center gap-4 bg-slate-50 p-4 rounded-[28px] border border-slate-100 group">
                                        <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center p-2.5 shrink-0">
                                            <img src={social.imageUrl} alt={social.name} className="w-full h-full object-contain" />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-black text-slate-400 uppercase tracking-wider">{social.name}</span>
                                                <button
                                                    onClick={() => removeSocialLink(social.id)}
                                                    className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="relative">
                                                <ExternalLink className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <input
                                                    type="url"
                                                    value={social.url}
                                                    onChange={(e) => updateSocialUrl(social.id, e.target.value)}
                                                    placeholder={`URL de tu perfil de ${social.name}`}
                                                    className="w-full bg-white border border-slate-200 p-2 pl-9 rounded-xl outline-none focus:border-primary font-medium text-slate-600 text-sm"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    <section className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                <CreditCard className="w-6 h-6 text-slate-900" />
                                Métodos de Pago
                            </h2>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={addPaymentMethod}
                                    className="flex items-center gap-1.5 text-slate-900 text-xs font-bold hover:underline"
                                >
                                    <Plus className="w-4 h-4" />
                                    Añadir Método
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black shadow-lg transition-all ${
                                        saved ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-900/20 active:scale-95'
                                    }`}
                                >
                                    {isSaving ? (
                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : saved ? (
                                        <Check className="w-3 h-3" />
                                    ) : (
                                        <Save className="w-3 h-3 text-primary" />
                                    )}
                                    {saved ? '¡Guardado!' : 'Guardar Datos'}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {paymentMethods.length === 0 ? (
                                <div className="text-center py-8 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                    <CreditCard className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                                    <p className="text-slate-400 text-sm font-medium">Configura cómo tus clientes pueden pagarte.</p>
                                </div>
                            ) : (
                                paymentMethods.map((method, idx) => (
                                    <div key={idx} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4 relative group font-bold">
                                        <button
                                            onClick={() => removePaymentMethod(idx)}
                                            className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-colors bg-white rounded-xl shadow-sm opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>

                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tipo de Pago</label>
                                                <select
                                                    value={method.type}
                                                    onChange={(e) => updatePaymentMethod(idx, 'type', e.target.value as any)}
                                                    className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm appearance-none"
                                                >
                                                    <option value="Pago Móvil">Pago Móvil</option>
                                                    <option value="Zelle">Zelle</option>
                                                    <option value="Transferencia">Transferencia</option>
                                                    <option value="Efectivo">Efectivo</option>
                                                    <option value="Otro">Otro</option>
                                                </select>
                                            </div>

                                            {method.type === 'Pago Móvil' && (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Banco</label>
                                                        <input
                                                            type="text"
                                                            value={method.bank}
                                                            onChange={(e) => updatePaymentMethod(idx, 'bank', e.target.value)}
                                                            className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                                            placeholder="Ej: Banesco"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Teléfono</label>
                                                        <input
                                                            type="text"
                                                            value={method.phone}
                                                            onChange={(e) => updatePaymentMethod(idx, 'phone', e.target.value)}
                                                            className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                                            placeholder="0412..."
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cédula / RIF</label>
                                                        <input
                                                            type="text"
                                                            value={method.rif}
                                                            onChange={(e) => updatePaymentMethod(idx, 'rif', e.target.value)}
                                                            className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                                            placeholder="V-123..."
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Titular</label>
                                                        <input
                                                            type="text"
                                                            value={method.owner}
                                                            onChange={(e) => updatePaymentMethod(idx, 'owner', e.target.value)}
                                                            className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                                            placeholder="Nombre..."
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {method.type === 'Zelle' && (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1 col-span-2">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Correo Zelle</label>
                                                        <input
                                                            type="email"
                                                            value={method.email}
                                                            onChange={(e) => updatePaymentMethod(idx, 'email', e.target.value)}
                                                            className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                                            placeholder="ejemplo@correo.com"
                                                        />
                                                    </div>
                                                    <div className="space-y-1 col-span-2">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Titular</label>
                                                        <input
                                                            type="text"
                                                            value={method.owner}
                                                            onChange={(e) => updatePaymentMethod(idx, 'owner', e.target.value)}
                                                            className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm"
                                                            placeholder="Nombre completo"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {method.type !== 'Pago Móvil' && method.type !== 'Zelle' && method.type !== 'Efectivo' && (
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Instrucciones / Datos</label>
                                                    <textarea
                                                        value={method.note}
                                                        onChange={(e) => updatePaymentMethod(idx, 'note', e.target.value)}
                                                        className="w-full bg-white border border-slate-200 p-3 rounded-xl outline-none focus:border-primary font-bold text-slate-700 text-sm min-h-[100px]"
                                                        placeholder="Escribe los detalles para que el cliente pueda pagar..."
                                                    />
                                                </div>
                                            )}

                                            {method.type === 'Efectivo' && (
                                                <p className="text-xs text-slate-500 italic ml-1">
                                                    Se indicará al cliente que el pago será recibido en el local o al repartidor.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </div>

            {/* Address Picker Modal */}
            {showPicker !== null && (
                <AddressPicker
                    onClose={() => setShowPicker(null)}
                    initialData={location?.coords ? { ...location.coords!, reference: location.reference || '' } : undefined}
                    onSave={(data) => {
                        setLocation({
                            ...(location || { address: '', city: 'Caracas', state: 'Distrito Capital', type: 'principal' }),
                            coords: { lat: data.lat, lng: data.lng },
                            reference: data.reference || location?.reference || ''
                        });
                        setShowPicker(null);
                    }}
                />
            )}

            {/* Verification Modal */}
            <VerificationModal
                isOpen={isVerificationModalOpen}
                onClose={() => setIsVerificationModalOpen(false)}
                restaurantId={rid}
                initialData={{
                    name: name,
                    rifPrefix: rifPrefix,
                    rifNumber: rifNumber,
                    instagram: instagram,
                    tiktok: tiktok,
                    address: location?.address || '',
                    addressReference: addressReference || location?.reference || '',
                    workingHoursSummary: 'Lunes a Domingo: 08:00 AM - 10:00 PM',
                    whatsappNumber: whatsappNumber,
                    requiresDelivery: requiresDelivery,
                    existingRifUrl: existingRifUrl
                }}
                onSuccess={(updated) => {
                    setVerificationStatus(updated.verificationStatus);
                    setName(updated.name);
                    const match = updated.rif.match(/^([JVGEC])-(.*)$/);
                    if (match) {
                        setRifPrefix(match[1] as any);
                        setRifNumber(match[2]);
                    }
                    setInstagram(updated.instagram);
                    setTiktok(updated.tiktok);
                    setAddressReference(updated.addressReference);
                    setWhatsappNumber(updated.whatsapp);
                    setRequiresDelivery(updated.requiresDelivery);
                    setExistingRifUrl(updated.rifPhotoUrl);
                    if (location) {
                        setLocation({
                            ...location,
                            reference: updated.addressReference
                        });
                    }
                }}
            />
        </div>
    );
}

import { useState, useRef, useEffect } from "react";
import { Camera, Upload, X, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ImageCaptureProps {
  onImageAnalyzed: (result: {
    dish_name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    confidence: number;
    image_url: string;
  }) => void;
}

const ImageCapture = ({ onImageAnalyzed }: ImageCaptureProps) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);
  const [showCameraPreview, setShowCameraPreview] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoReadyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPreview(result);
      analyzeImage(result, file);
    };
    reader.readAsDataURL(file);
  };

  const checkCameraPermission = async (): Promise<boolean> => {
    try {
      // Check if camera permissions API is available
      if (navigator.permissions && navigator.permissions.query) {
        const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        return permission.state === 'granted';
      }
      return true; // Assume available if API not supported
    } catch (error) {
      return true; // Fallback to true if permission check fails
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } // Prefer front camera for desktop/laptop
      });
      setStream(mediaStream);
      setShowCameraPreview(true);
      setIsVideoReady(false);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        // Clear any existing timeout
        if (videoReadyTimeoutRef.current) {
          clearTimeout(videoReadyTimeoutRef.current);
        }
        
        // Set up metadata loaded handler
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch((error) => {
              console.error('Error playing video:', error);
              toast.error('Error starting camera preview');
            });
          }
        };
        
        // Set up playing handler - this is more reliable
        videoRef.current.onplaying = () => {
          if (videoReadyTimeoutRef.current) {
            clearTimeout(videoReadyTimeoutRef.current);
          }
          setIsVideoReady(true);
        };
        
        // Fallback: if video doesn't start playing after 3 seconds, mark as ready anyway
        videoReadyTimeoutRef.current = setTimeout(() => {
          setIsVideoReady(true);
        }, 3000);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('Unable to access camera. Please check permissions or try file upload.');
      setStream(null);
      setShowCameraPreview(false);
    }
  };

  const stopCamera = () => {
    if (videoReadyTimeoutRef.current) {
      clearTimeout(videoReadyTimeoutRef.current);
      videoReadyTimeoutRef.current = null;
    }
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setShowCameraPreview(false);
      setIsVideoReady(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !isVideoReady) {
      toast.error('Camera is not ready yet. Please wait...');
      return;
    }
    
    const video = videoRef.current;
    
    // Check if video has valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      toast.error('Camera preview is not ready. Please wait...');
      return;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      toast.error('Failed to create canvas context');
      return;
    }
    
    ctx.drawImage(video, 0, 0);
    
    // Convert canvas to blob then to file
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Failed to capture photo');
        return;
      }
      
      const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          setPreview(result);
          stopCamera();
          analyzeImage(result, file);
        }
      };
      reader.readAsDataURL(file);
    }, 'image/jpeg', 0.95);
  };

  const handleCameraClick = async () => {
    // Check if we're on mobile - use simple file input
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    
    if (isMobile) {
      cameraInputRef.current?.click();
    } else {
      // Desktop - open camera directly
      await startCamera();
    }
  };

  // Check camera availability on mount (non-intrusive)
  useEffect(() => {
    const checkAvailability = async () => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Assume camera is available - we'll handle errors when user clicks
        setCameraAvailable(true);
      } else {
        setCameraAvailable(false);
      }
    };
    
    checkAvailability();
    
    // Cleanup stream on unmount
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const analyzeImage = async (base64Image: string, file: File) => {
    setIsAnalyzing(true);
    try {
      // Step 1: Upload image to storage
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('meal-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('meal-images')
        .getPublicUrl(fileName);

      // Step 2: Identify dish with AI
      const { data: identifyData, error: identifyError } = await supabase.functions.invoke(
        'identify-dish',
        {
          body: { imageBase64: base64Image },
        }
      );

      if (identifyError) throw identifyError;

      // Step 3: Save meal to database
      const { error: insertError } = await supabase.from('meals').insert({
        user_id: user.id,
        dish_name: identifyData.dish_name,
        calories: identifyData.calories,
        protein: identifyData.protein,
        carbs: identifyData.carbs,
        fat: identifyData.fat,
        confidence: identifyData.confidence,
        image_url: urlData.publicUrl,
      });

      if (insertError) throw insertError;

      toast.success("✅ Meal added successfully! Updated your daily list.");
      onImageAnalyzed({
        ...identifyData,
        image_url: urlData.publicUrl,
      });

      // Reset
      setPreview(null);
      setIsAnalyzing(false);
    } catch (error) {
      console.error('Error analyzing image:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to analyze image');
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleFileSelect(e.target.files[0]);
          }
        }}
      />

      <AnimatePresence>
        {showCameraPreview && !preview ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="relative overflow-hidden glass-card shadow-glass border-0">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-64 object-cover bg-gray-900"
              />
              {!isVideoReady && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-3" />
                    <p className="text-sm font-medium tracking-wide text-white">Starting camera...</p>
                  </div>
                </div>
              )}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4">
                <Button
                  size="lg"
                  variant="destructive"
                  className="rounded-full shadow-lg"
                  onClick={stopCamera}
                >
                  <X className="w-6 h-6 mr-2" />
                  Cancel
                </Button>
                <Button
                  size="lg"
                  className={`rounded-full shadow-lg ${
                    isVideoReady 
                      ? 'bg-white hover:bg-gray-100 text-gray-900' 
                      : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  }`}
                  onClick={capturePhoto}
                  disabled={!isVideoReady}
                >
                  <Camera className="w-8 h-8" />
                </Button>
              </div>
            </Card>
          </motion.div>
        ) : preview ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="relative overflow-hidden glass-card shadow-glass border-0">
              <img
                src={preview}
                alt="Preview"
                className="w-full h-64 object-cover"
              />
              {isAnalyzing && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-3" />
                    <p className="text-sm font-medium tracking-wide">Analyzing your meal...</p>
                  </div>
                </div>
              )}
              {!isAnalyzing && (
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2 rounded-full"
                  onClick={() => setPreview(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </Card>
          </motion.div>
        ) : (
          <motion.div
            className="grid grid-cols-2 gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Button
              size="lg"
              className="h-32 flex flex-col gap-2 gradient-primary shadow-glass hover:shadow-glow text-white rounded-2xl tracking-wide"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8" />
              <span>Upload Image</span>
            </Button>
            <Button
              size="lg"
              className="h-32 flex flex-col gap-2 gradient-accent shadow-glass hover:shadow-glow text-white rounded-2xl tracking-wide"
              onClick={handleCameraClick}
            >
              <Camera className="w-8 h-8" />
              <span>Take Photo</span>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ImageCapture;

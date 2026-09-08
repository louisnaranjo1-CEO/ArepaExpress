import React, { useState, useEffect } from 'react';
import { getCachedImageUrl } from '../lib/imageCache';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  fallbackSrc?: string;
}

export const CachedImage: React.FC<CachedImageProps> = ({ src, fallbackSrc, alt, className, style, ...props }) => {
  const [cachedSrc, setCachedSrc] = useState<string>(src || '');

  useEffect(() => {
    if (!src) return;
    let isMounted = true;
    getCachedImageUrl(src).then((url) => {
      if (isMounted) setCachedSrc(url);
    });
    return () => {
      isMounted = false;
    };
  }, [src]);

  return (
    <img
      src={cachedSrc || fallbackSrc}
      alt={alt || ''}
      className={className}
      style={style}
      loading="lazy"
      onError={(e) => {
        if (fallbackSrc && (e.currentTarget.src !== fallbackSrc)) {
          e.currentTarget.src = fallbackSrc;
        }
      }}
      {...props}
    />
  );
};

export default CachedImage;

import React, { useState, useEffect, useRef } from 'react';

interface LazyImageProps {
    src: string;
    alt: string;
    className?: string;
    placeholder?: string;
}

const LazyImage: React.FC<LazyImageProps> = ({
    src,
    alt,
    className = '',
    placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect fill="%23f1f5f9" width="400" height="300"/%3E%3C/svg%3E'
}) => {
    const [imageSrc, setImageSrc] = useState(placeholder);
    const [imageRef, setImageRef] = useState<HTMLImageElement | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        let observer: IntersectionObserver;

        if (imageRef && 'IntersectionObserver' in window) {
            observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            setImageSrc(src);
                            observer.unobserve(imageRef);
                        }
                    });
                },
                {
                    rootMargin: '50px', // Start loading 50px before image enters viewport
                }
            );

            observer.observe(imageRef);
        } else {
            // Fallback for browsers that don't support IntersectionObserver
            setImageSrc(src);
        }

        return () => {
            if (observer && imageRef) {
                observer.unobserve(imageRef);
            }
        };
    }, [src, imageRef]);

    return (
        <img
            ref={setImageRef}
            src={imageSrc}
            alt={alt}
            className={`${className} ${!isLoaded ? 'blur-sm' : 'blur-0'} transition-all duration-300`}
            onLoad={() => setIsLoaded(true)}
            loading="lazy" // Native lazy loading as fallback
        />
    );
};

export default LazyImage;

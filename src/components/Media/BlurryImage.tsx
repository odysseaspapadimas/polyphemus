/* eslint-disable @next/next/no-img-element */

/*
  @credits https://theran.dev/blog/2020/lazy-image
*/

"use client";

import React, { useEffect, useState } from "react";

type Props = {
  preview?: string;
  src: string;
  alt: string;
  className: string;
  bgColor?: string;
  width?: number;
  height?: number;
};

const BlurryImage = ({
  preview,
  src,
  alt,
  className,
  bgColor = "transparent",
  width,
  height,
}: Props) => {
  const [currentImage, setCurrentImage] = useState(preview);
  const [loading, setLoading] = useState(true);

  const fetchImage = (src: string) => {
    const loadingImage = new Image();
    loadingImage.src = src;
    loadingImage.onload = () => {
      setCurrentImage(loadingImage.src);
      setLoading(false);
    };
  };

  useEffect(() => {
    if (!src) return;
    fetchImage(src);
  }, [src]);

  return (
    <img
      style={{
        filter: `${loading ? "blur(8px)" : ""}`,
        transition: `${loading ? "none" : "filter 0.3s linear"}`,
        width: "100%",
        background: bgColor,
      }}
      src={currentImage}
      alt={alt}
      className={className}
      width={width}
      height={height}
    />
  );
};

export default BlurryImage;

#!/usr/bin/env python3
"""
Image resizer script - resizes an image to 512x512 pixels
"""

from PIL import Image
import sys
import os

def resize_image(input_path, output_path=None, size=(512, 512)):
    """
    Resize an image to specified dimensions
    
    Args:
        input_path: Path to input image
        output_path: Path for output image (optional, defaults to input_name_512x512.ext)
        size: Tuple of (width, height) for output size
    """
    try:
        # Open the image
        img = Image.open(input_path)
        
        # Convert RGBA to RGB if necessary (for JPEG output)
        if img.mode in ('RGBA', 'LA', 'P'):
            # Create a white background
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        
        # Resize the image using LANCZOS for high quality
        img_resized = img.resize(size, Image.Resampling.LANCZOS)
        
        # Generate output filename if not provided
        if output_path is None:
            base, ext = os.path.splitext(input_path)
            output_path = f"{base}_512x512{ext}"
        
        # Save the resized image
        img_resized.save(output_path, quality=95 if output_path.lower().endswith('.jpg') or output_path.lower().endswith('.jpeg') else None)
        
        print(f"✅ Successfully resized image to {size[0]}x{size[1]}")
        print(f"📁 Saved as: {output_path}")
        
        # Show file sizes
        original_size = os.path.getsize(input_path) / 1024  # in KB
        new_size = os.path.getsize(output_path) / 1024  # in KB
        print(f"📊 Original size: {original_size:.1f} KB")
        print(f"📊 New size: {new_size:.1f} KB")
        
    except FileNotFoundError:
        print(f"❌ Error: File '{input_path}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error resizing image: {str(e)}")
        sys.exit(1)

def main():
    if len(sys.argv) < 2:
        print("Usage: python resize_image.py <input_image> [output_image]")
        print("Example: python resize_image.py emoji.png")
        print("         python resize_image.py emoji.png emoji_resized.png")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    resize_image(input_path, output_path)

if __name__ == "__main__":
    main()
/**
 * A skeleton loader component that mimics the layout of the Masonry gallery.
 * It displays a grid of pulsing placeholders with varying heights to simulate
 * the appearance of the image gallery while it's loading.
 */
const MasonrySkeleton = () => {
  // An array to create a number of skeleton items.
  const skeletonItems = Array.from({ length: 9 });

  return (
    <div className="columns-2 md:columns-3 gap-4 space-y-4">
      {skeletonItems.map((_, index) => (
        <div
          key={index}
          // Each item is a block with a pulsing animation.
          // The height varies based on its index to create a masonry-like effect.
          className={`
            animate-pulse
            bg-secondary-light/80
            dark:bg-secondary-dark/80
            rounded-lg
            w-full 
            break-inside-avoid 
            ${index % 3 === 0 ? "h-80" : index % 3 === 1 ? "h-96" : "h-64"}
          `}
        ></div>
      ))}
    </div>
  );
};

export default MasonrySkeleton;

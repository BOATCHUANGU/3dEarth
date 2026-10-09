import { PerspectiveCamera, Vector3 } from 'three';
import { geodeticToWorld, surfaceNormal } from '../geo/CoordinateSystem';
import { locations } from '../app/locations';

/** Geographic DOM labels, independently extensible from surface/imagery rendering. */
export class MarkerLayer {
  visible = true;
  selected = 'shanghai';
  private readonly entries;
  private readonly projected = new Vector3();

  constructor(
    private container: HTMLElement,
    onSelect: (id: string) => void,
  ) {
    this.entries = locations.map((location) => {
      const element = document.createElement('button');
      element.className = 'map-marker';
      element.setAttribute('aria-label', `飞往${location.name}`);
      element.innerHTML = `<span class="marker-dot"></span><span class="marker-name">${location.name}<small>${location.english}</small></span>`;
      element.addEventListener('click', () => onSelect(location.id));
      container.append(element);
      return {
        location,
        element,
        position: geodeticToWorld(location.latitude, location.longitude, 1),
        normal: surfaceNormal(location.latitude, location.longitude),
      };
    });
  }

  update(camera: PerspectiveCamera, width: number, height: number) {
    this.entries.forEach(({ location, element, position, normal }) => {
      const facing = normal.dot(this.projected.copy(camera.position).sub(position).normalize());
      this.projected.copy(position).project(camera);
      const shown =
        this.visible &&
        facing > 0.12 &&
        Math.abs(this.projected.x) < 0.93 &&
        Math.abs(this.projected.y) < 0.94;
      element.hidden = !shown;
      element.classList.toggle('selected', location.id === this.selected);
      // Anchor the center of the pin, not the top-left corner of its text label.
      if (shown)
        element.style.transform = `translate(${(this.projected.x * 0.5 + 0.5) * width}px,${(-this.projected.y * 0.5 + 0.5) * height}px) translate(-3px, -50%)`;
    });
  }

  dispose() {
    this.container.replaceChildren();
  }
}

// Hamburger

document.addEventListener("DOMContentLoaded", function () {

    const hamburger = document.getElementById("hamburger");
    const navbar = document.getElementById("navbar");
    const navLinks = document.querySelectorAll(".nav-link");

    hamburger.addEventListener("click", function () {
        navbar.classList.toggle("active");

        const icon = this.querySelector("i");
        icon.classList.toggle("ri-menu-3-line");
        icon.classList.toggle("ri-close-line");
    });

    navLinks.forEach(link => {
        link.addEventListener("click", () => {
            navbar.classList.remove("active");

            const icon = hamburger.querySelector("i");
            icon.classList.remove("ri-close-line");
            icon.classList.add("ri-menu-3-line");
        });
    });
});

// Navbar Scroll

window.addEventListener("scroll", function () {
    const header = document.getElementById("main-header");

    if (window.scrollY > 100) {
        header.classList.add("scrolled");
    } else {
        header.classList.remove("scrolled");
    }
});


// Testimonials

const slider = document.getElementById("slider");
const nextBtn = document.getElementById("nextBtn");
const prevBtn = document.getElementById("prevBtn");
const dotsContainer = document.getElementById("dots");

let index = 0;
const gap = 30;

function getVisibleCards() {
    if (window.innerWidth <= 480) return 1;
    if (window.innerWidth <= 768) return 2;
    return 3;
}

function getCardWidth() {
    const card = slider.querySelector(".card");
    return card.offsetWidth + gap;
}

function getTotalSlides() {
    return Math.ceil(slider.children.length / getVisibleCards());
}

function moveTo(i) {
    index = i;
    const moveX = index * getVisibleCards() * getCardWidth();
    slider.style.transform = `translateX(-${moveX}px)`;
    updateDots();
}

nextBtn.onclick = () => {
    index = (index + 1) % getTotalSlides();
    moveTo(index);
};

prevBtn.onclick = () => {
    index = (index - 1 + getTotalSlides()) % getTotalSlides();
    moveTo(index);
};

setInterval(() => {
    nextBtn.click();
}, 5000);

function createDots() {
    dotsContainer.innerHTML = "";
    const total = getTotalSlides();

    for (let i = 0; i < total; i++) {
        const dot = document.createElement("span");
        dot.addEventListener("click", () => moveTo(i));
        dotsContainer.appendChild(dot);
    }
}

function updateDots() {
    const dots = dotsContainer.children;
    for (let i = 0; i < dots.length; i++) {
        dots[i].classList.remove("active");
    }
    if (dots[index]) dots[index].classList.add("active");
}

window.addEventListener("load", () => {
    createDots();
    updateDots();
});

window.addEventListener("resize", () => {
    index = 0;
    createDots();
    moveTo(index);
});


// Year Update

document.getElementById("year").textContent = new Date().getFullYear();


// Hero Image Auto Slider

document.addEventListener("DOMContentLoaded", function () {

    const heroImg = document.getElementById("heroImg");

    const images = [
        "./public/Assets/Hero/hero.png",
        "./public/Assets/Hero/hero-01.png",
    ];

    let currentIndex = 0;

    setInterval(() => {
        // fade out
        heroImg.style.opacity = 0;

        setTimeout(() => {
            currentIndex = (currentIndex + 1) % images.length;
            heroImg.src = images[currentIndex];

            // fade in
            heroImg.style.opacity = 1;
        }, 300);

    }, 5000);

});